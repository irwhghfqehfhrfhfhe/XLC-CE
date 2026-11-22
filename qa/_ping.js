/* 最小冒烟脚本：只证明「打包版能起、能跑 UI 脚本」，用来把启动问题和脚本问题分开。
 * 用法：LMC_SMOKE_UI_JS=<绝对路径>/qa/_ping.js "dist/win-unpacked/XLC CE Launcher 1.4.10.exe" */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

ok(!!window.lmc, 'preload 桥接在');
ok(!!document.getElementById('bdRoot'), '基岩版面板节点在');
ok(!!document.getElementById('bdGame'), '主菜单「游戏」按钮在');
await new Promise(r => setTimeout(r, 300));

return { ok: lines.every(l => l.startsWith('PASS')), lines, summary: '最小冒烟（打包版启动）' };
