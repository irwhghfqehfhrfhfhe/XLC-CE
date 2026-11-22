/* 打包版验收（1.4.6）：确认侧边栏回到「常驻显示」、极速模式按钮（左下角小圆）与侧栏大图标都删干净
 * 用法：LMC_SMOKE_DATA_DIR=<临时> LMC_SMOKE_UI_JS=<本文件绝对路径> "dist/win-unpacked/XLC CE Launcher 1.4.6.exe"
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

const ver = await window.lmc.getConfig().then(c => c.appVersion).catch(() => '');
ok(ver === '1.4.6', '打包版版本号是 1.4.6', ver);

/* ---- 删干净：极速模式按钮（左下角小圆）/ 侧栏大图标 ---- */
ok(!document.getElementById('avatar'), '左下角的极速模式圆按钮已删除');
ok(!document.querySelector('.rail-bottom'), '侧栏底部不再留空槽位');
ok(!document.querySelector('.rail-logo'), '侧栏顶部的大图标已删除');
const cfg = await window.lmc.getConfig();
ok(!Object.prototype.hasOwnProperty.call(cfg, 'turboMode'), '配置里没有 turboMode', JSON.stringify(Object.keys(cfg).filter(k => /turbo/i.test(k))));
ok(!Object.prototype.hasOwnProperty.call(cfg, 'railAutoHide'), '配置里没有 railAutoHide（自动隐藏已回退）', JSON.stringify(Object.keys(cfg).filter(k => /railAuto/i.test(k))));

/* ---- 侧边栏回到常驻显示 ---- */
ok(!document.body.classList.contains('rail-auto'), '没有 rail-auto（自动隐藏模式不存在）');
ok(!document.body.classList.contains('rail-collapsed'), '没有 rail-collapsed（不会被收起来）');
ok(!document.getElementById('railEdge'), '左边缘触发条已删除');
const railBox = document.getElementById('rail').getBoundingClientRect();
ok(railBox.width > 40 && railBox.right > 40, '侧栏常驻在左侧、宽度正常', 'w=' + Math.round(railBox.width) + ' right=' + Math.round(railBox.right));
const mainBox = document.getElementById('main').getBoundingClientRect();
ok(Math.abs(mainBox.left - railBox.right) <= 2, '主区紧贴侧栏右侧（并排布局，不是浮层）', 'main.left=' + Math.round(mainBox.left) + ' rail.right=' + Math.round(railBox.right));

const nav = document.querySelectorAll('#railNav .rail-btn').length;
ok(nav === 11, '侧栏 11 个按钮都在', String(nav));

/* 设置页不该再出现「自动隐藏」开关 */
gotoPage('settings');
await sleep(600);
ok(!document.getElementById('setRailAutoHide'), '设置 → 个性化里不再有「自动隐藏」开关');
ok(!!document.getElementById('railPosList'), '「侧边栏位置」四方向选择器仍在');

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: '打包版验收（侧栏回退）', lines };
