/* 打包版验收：确认 1.2.2 的「侧边栏按钮顺序 / 显隐 / 启动页」真的进了安装包
 * 用法：LMC_SMOKE_DATA_DIR=<临时> LMC_SMOKE_UI_JS=<本文件绝对路径> "dist/win-unpacked/Xero Lite Craft Launcher 1.2.2.exe"
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

ok(!!document.getElementById('railOrderList'), '打包版有个性化「侧边栏按钮顺序」卡片');
ok(!!document.getElementById('startPageList'), '打包版有个性化「启动页」卡片');
const rows = document.querySelectorAll('#railOrderList .rail-ord-row').length;
const starts = document.querySelectorAll('#startPageList .start-page-opt').length;
ok(rows === 11 && starts === 11, '顺序列表 / 启动页选项各 11 项', 'rows=' + rows + ' starts=' + starts);

/* 收起「下载」→ 侧栏按钮真的隐藏 + 写进配置 */
document.querySelector('#railOrderList .rail-ord-row[data-page="download"] .ro-btn[data-act="eye"]').click();
await sleep(600);
let cfg = await window.lmc.getConfig();
ok((cfg.railHidden || []).indexOf('download') >= 0, '收起状态已落盘', JSON.stringify(cfg.railHidden));
ok(document.querySelector('#railNav .rail-btn[data-page="download"]').classList.contains('rail-hide'), '侧栏「下载」按钮已隐藏');

/* 把「设置」挪到第一位 */
for (let i = 0; i < 20; i++) {
  const b = document.querySelector('#railOrderList .rail-ord-row[data-page="settings"] .ro-btn[data-act="up"]');
  if (!b || b.disabled) break;
  b.click();
  await sleep(120);
}
await sleep(500);
cfg = await window.lmc.getConfig();
const railFirst = (document.querySelector('#railNav .rail-btn:not(.rail-hide)') || {}).dataset.page;
ok((cfg.railOrder || [])[0] === 'settings', '新顺序已落盘', JSON.stringify(cfg.railOrder));
ok(railFirst === 'settings', '侧栏第一个按钮变成了「设置」', railFirst);

/* 启动页：设成工具箱 → 回主页再走一遍启动页逻辑 */
document.querySelector('#startPageList .start-page-opt[data-page="tools"]').click();
await sleep(600);
cfg = await window.lmc.getConfig();
ok(cfg.startPage === 'tools', '启动页已落盘', cfg.startPage);
gotoPage('home');
applyStartPage();
await sleep(200);
ok((document.querySelector('.page.active') || {}).id === 'page-tools', '启动页逻辑生效（落在工具箱）', (document.querySelector('.page.active') || {}).id);

/* 恢复默认，别把测试残留留在配置里 */
document.getElementById('btnRailOrderReset').click();
document.getElementById('btnRailShowAll').click();
await sleep(600);
cfg = await window.lmc.getConfig();
ok((cfg.railOrder || []).length === 0 && (cfg.railHidden || []).length === 0, '一键还原可用', JSON.stringify({ o: cfg.railOrder, h: cfg.railHidden }));

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: '打包版侧栏自定义', lines };
