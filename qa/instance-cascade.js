/* 版本依赖（原版基座）行为验证
 * 覆盖用户反馈：「装 26.3 Fabric 会多出一个 26.3，而且 26.3 删不掉，只能先删 Fabric」。
 * 期望行为：
 *   1) 扫描时把「被加载器实例继承的原版」标成 isBase，并列出依赖它的实例；
 *   2) 直接删基座不再是一句「请先删除它们」，而是返回 HAS_CHILDREN + 清单（界面去二次确认）；
 *   3) 带 cascade 时一次性删掉基座 + 依赖它的实例；
 *   4) 删掉加载器实例后，如果原版基座已经没人用了，返回 orphanBase 提示可以清掉。
 * 用法：LMC_SMOKE_GAME_DIR=qa/.tmp-cascade/game LMC_SMOKE_UI_JS=<本文件> electron .
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

/* ---- 1. 扫描：基座与依赖关系 ---- */
const s1 = await window.lmc.scan();
const ids = (s1.versions || []).map(v => v.id);
const base = (s1.versions || []).find(v => v.id === '26.3');
const kid = (s1.versions || []).find(v => v.id === '26.3-fabric-0.18.1');
ok(!!base && !!kid, '扫到 26.3 与它的 Fabric 实例', ids.join(','));
ok(!!(base && base.isBase), '26.3 被标记为「基座」', JSON.stringify(base && { isBase: base.isBase, children: base.children }));
ok(!!(base && (base.children || []).includes('26.3-fabric-0.18.1')), '基座记录了依赖它的实例', JSON.stringify(base && base.children));
ok(!!(kid && kid.isBase === false), 'Fabric 实例本身不算基座');

/* ---- 2. 直接删基座：拦下但要给清单，不再是一句死错误 ---- */
const d1 = await window.lmc.instanceDelete({ id: '26.3' });
ok(!!(d1 && !d1.ok && d1.code === 'HAS_CHILDREN'), '单独删 26.3 返回 HAS_CHILDREN（界面可二次确认）', JSON.stringify(d1));
ok(!!(d1 && (d1.children || []).includes('26.3-fabric-0.18.1')), '拦截结果里带着依赖实例名');
ok(!!(d1 && /26\.3-fabric-0\.18\.1/.test(d1.error || '')), '错误文案说明了是谁在用它', d1 && d1.error);

/* ---- 3. cascade：一次删干净 ---- */
const d2 = await window.lmc.instanceDelete({ id: '26.3', cascade: true });
ok(!!(d2 && d2.ok), 'cascade 删除成功', JSON.stringify(d2));
ok(!!(d2 && (d2.removed || []).includes('26.3-fabric-0.18.1')), 'cascade 连带删掉了 Fabric 实例', JSON.stringify(d2 && d2.removed));
const s2 = await window.lmc.scan();
const ids2 = (s2.versions || []).map(v => v.id);
ok(!ids2.includes('26.3') && !ids2.includes('26.3-fabric-0.18.1'), '两个目录都真的没了', ids2.join(','));

/* ---- 4. 删加载器实例 → 基座变成孤儿，给出提示 ---- */
const d3 = await window.lmc.instanceDelete({ id: '26.4-fabric-0.18.1' });
ok(!!(d3 && d3.ok), '删除 Fabric 实例成功', JSON.stringify(d3));
ok(d3 && d3.orphanBase === '26.4', '返回 orphanBase=26.4（原版已没人用）', d3 && d3.orphanBase);
const s3 = await window.lmc.scan();
const base3 = (s3.versions || []).find(v => v.id === '26.4');
ok(!!base3 && base3.isBase === false && (base3.children || []).length === 0, '26.4 变回普通原版（不再挂「基座」）', JSON.stringify(base3 && { isBase: base3.isBase, children: base3.children }));

/* ---- 5. 链式依赖：26.5 ← 26.5-fabric ← 26.5-fabric-optifine，删基座要连孙实例一起清 ---- */
const d4 = await window.lmc.instanceDelete({ id: '26.5', cascade: true });
ok(!!(d4 && d4.ok), '链式依赖下删基座成功', JSON.stringify(d4 && { ok: d4.ok, removed: d4.removed }));
ok(!!(d4 && (d4.removed || []).length === 2), '孙实例也一并删除（removed 含 2 个）', JSON.stringify(d4 && d4.removed));
const s4 = await window.lmc.scan();
const ids4 = (s4.versions || []).map(v => v.id);
ok(!ids4.some(id => id.startsWith('26.5')), '26.5 整条链都没了', ids4.join(','));

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: '基座依赖与级联删除', lines };
