/* 真启动一次（决定性验证）+ 把启动过程中的主进程日志/退出信息带出来
 * 用法：LMC_SMOKE_GAME_DIR=<实例目录> LMC_SMOKE_DATA_DIR=<临时> LMC_SMOKE_UI_JS=<本文件>
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const s = await window.lmc.scan();
const inst = (s.versions || []).map(v => v.id).find(id => /fabric/i.test(id));
ok(!!inst, '找到 Fabric 实例', inst);
if (!inst) return { ok: false, lines };

const logs = [];
const exits = [];
window.lmc.on('launch:log', (t) => logs.push(String(t)));
window.lmc.on('launch:exit', (d) => exits.push(d));

const r = await window.lmc.launch({ versionId: inst, username: 'QA' });
lines.push('INFO launch -> ' + JSON.stringify(r));

let ex = '';
for (let i = 0; i < 30; i++) {
  await sleep(3000);
  const d = await window.lmc.diagGame({ instance: inst });
  if (d.ok && d.diag && d.diag.excerpt) ex = d.diag.excerpt;
  if (/Fabric Loader/i.test(ex) || exits.length) break;
}

lines.push('INFO 主进程日志(' + logs.length + '): ' + logs.slice(-12).join(' | ').slice(0, 1200));
lines.push('INFO 退出事件: ' + JSON.stringify(exits).slice(0, 600));
lines.push('INFO 游戏日志片段: ' + (ex.slice(-600) || '（空）'));

ok(/Fabric Loader/i.test(ex) || /Loading Minecraft/i.test(ex), '加载器真的起来了（日志里有 Fabric Loader 启动行）',
  (ex.match(/Loading Minecraft[^\n]*/i) || [''])[0]);
ok(!/Could not find or load main class/i.test(ex), '日志里没有「找不到主类」');

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: 'launch probe', lines };
