/* 打包版验收：原版基座的依赖标注与删除拦截是否随包生效
 * 用法：LMC_SMOKE_GAME_DIR=<有 原版+加载器 实例的目录> LMC_SMOKE_UI_JS=<绝对路径> "dist/win-unpacked/...exe"
 * 注意：这里**只验证不真删**（不传 cascade），避免破坏验收用的实例目录。
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

const s = await window.lmc.scan();
const vs = s.versions || [];
const base = vs.find(v => v.isBase);
ok(!!base, '打包版能识别原版基座', JSON.stringify(vs.map(v => ({ id: v.id, isBase: v.isBase, children: v.children }))));
ok(!!(base && (base.children || []).length > 0), '基座记录了依赖它的实例', base && JSON.stringify(base.children));

if (base) {
  const d = await window.lmc.instanceDelete({ id: base.id });
  ok(!!(d && !d.ok && d.code === 'HAS_CHILDREN'), '打包版删基座返回 HAS_CHILDREN（不真删）', JSON.stringify(d && { code: d.code, children: d.children }));
  const after = await window.lmc.scan();
  ok((after.versions || []).some(v => v.id === base.id), '未带 cascade 时基座仍在（安全）');
}

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: '打包版基座依赖', lines };
