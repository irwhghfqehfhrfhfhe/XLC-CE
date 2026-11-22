/* 打包版验收：确认打进去的代码能扫实例、能做完整性检查，且加载器本体在 classpath 里
 * 用法：LMC_SMOKE_GAME_DIR=<已有实例目录> LMC_SMOKE_DATA_DIR=<临时> LMC_SMOKE_UI_JS=<绝对路径> "dist/win-unpacked/....exe"
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

const s = await window.lmc.scan();
const inst = (s.versions || []).map(v => v.id).find(id => /fabric/i.test(id));
ok(!!inst, '打包版能扫到 Fabric 实例', inst);

const hasCard = await (async () => {
  document.querySelector('[data-page="diag"]').click();
  await new Promise(r => setTimeout(r, 300));
  return !!document.getElementById('btnDiagRepair');
})();
ok(hasCard, '打包版诊断页有「实例文件完整性」卡片');

if (inst) {
  const ic = await window.lmc.diagIntegrity({ instance: inst, deep: false });
  ok(ic.ok && ic.integrity && ic.integrity.ok, '打包版完整性检查通过',
    JSON.stringify({ total: ic.integrity && ic.integrity.total, problems: (ic.integrity && ic.integrity.problems || []).length }));
  ok(/fabric-loader/.test(ic.integrity && ic.integrity.loaderLib), '加载器本体在 classpath 里', ic.integrity && ic.integrity.loaderLib);
  ok(/KnotClient/.test(ic.integrity && ic.integrity.mainClass), '主类是 KnotClient', ic.integrity && ic.integrity.mainClass);
}

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: '打包版完整性诊断可用', lines };
