/* 老版本装出来的坏实例能不能被「一键修复」救回来？
 * 场景：实例 JSON 里没有 fabric-loader 这一条（老安装器漏了），jar 也没有。
 * 期望：① 体检报「加载器本体缺失」 ② 修复后 JSON 补回这一条、jar 落盘 ③ 再体检通过
 * 用法：LMC_SMOKE_GAME_DIR=<实例目录> LMC_SMOKE_DATA_DIR=<临时> LMC_SMOKE_UI_JS=<本文件>
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

const s = await window.lmc.scan();
const inst = (s.versions || []).map(v => v.id).find(id => /fabric/i.test(id));
ok(!!inst, '找到 Fabric 实例', inst);
if (!inst) return { ok: false, lines };

const before = await window.lmc.diagIntegrity({ instance: inst, deep: false });
const probs = (before.integrity && before.integrity.problems) || [];
ok(before.integrity && before.integrity.ok === false, '坏实例被判定为不完整');
ok(probs.some(p => p.loaderEntry === 'fabric'), '识别出「加载器本体整条缺失」（不只是文件没了）',
  probs.map(p => p.rel).join(' | ').slice(0, 160));

const rep = await window.lmc.diagRepair({ instance: inst });
ok(!!rep && rep.ok, '一键修复成功', JSON.stringify({ fixed: rep.repair && rep.repair.fixed, failed: rep.repair && rep.repair.failed }));
ok(/fabric-loader/.test((rep.integrity && rep.integrity.loaderLib) || ''), '实例 JSON 里补回了 fabric-loader', rep.integrity && rep.integrity.loaderLib);
ok(rep.integrity && rep.integrity.ok, '修复后完整性检查通过');

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: '老坏实例可一键修复', lines };
