/* 验证 1.2.2 的「侧边栏按钮自定义」与「启动页」：
   · 顺序编辑（▲▼ / 拖拽 / 恢复默认）立即改写侧栏 DOM 并落盘
   · 眼睛收起按钮（主页 / 设置必须没有眼睛）
   · 启动页设置后重开启动器直接落在那一页
   · 上下左右四个方向都按同一份顺序排、窄窗口不被挤出窗口外
   用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/rail-custom.js */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const { QA_SHOW, shotFile } = require('./_vis'); /* 默认隐藏窗口，QA_SHOW=1 才弹出来看图 */

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const DEFAULTS = ['home', 'download', 'instances', 'tools', 'plugins', 'account', 'friends', 'mp', 'diag', 'import', 'settings'];
const baseCfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: '1.2.4', autoCheckUpdate: false, seenVersion: '1.2.4', theme: 'dark',
  railPosition: 'left', railOrder: [], railHidden: [], startPage: 'home'
};
const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, patch) => { Object.assign(baseCfg, patch); return Object.assign({}, baseCfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({
    ok: true, gameDir: 'D:\\X',
    versions: [
      { id: '1.21.4', loader: 'Fabric', children: [] },
      { id: '1.21.4-Fabric', loader: 'Fabric', children: [] }
    ],
    broken: [], saves: []
  }),
  'java:detect': () => ({ ok: true, javas: [], major: 0 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4-snapshot-2' }, versions: [] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'X', friends: [] }),
  'friends:presence': () => ({ ok: true, online: [] }),
  'friends:signal-poll': () => ({ ok: true, items: [] }),
  'mp:status': () => ({ ok: true, installed: false }),
  'update:check': () => ({ ok: true, current: '1.2.4', latest: '1.2.4', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/* 任何一处抛错都要立刻结束进程并把原因打出来，否则 electron 会一直挂着（之前就是被超时干掉的） */
process.on('unhandledRejection', (e) => { console.log('UNHANDLED ' + ((e && e.stack) || e)); app.exit(2); });
process.on('uncaughtException', (e) => { console.log('UNCAUGHT ' + ((e && e.stack) || e)); app.exit(2); });
let PASS = 0, FAIL = 0;
const ok = (cond, name, extra) => {
  if (cond) { PASS++; console.log('PASS ' + name + (extra ? '  ' + extra : '')); }
  else { FAIL++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); }
};

const JS_RAIL = `(() => Array.prototype.map.call(document.querySelectorAll('#railNav .rail-btn'), b => b.dataset.page))()`;

app.whenReady().then(async () => {
  try {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: QA_SHOW, frame: false, width: 1360, height: 940,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) console.log('CONSOLE[' + lvl + '] ' + msg); });
  const run = async (code) => {
    try { return await win.webContents.executeJavaScript(code, true); }
    catch (e) { console.log('RUN_ERR ' + e.message + '\n  CODE: ' + String(code).slice(0, 160)); throw e; }
  };
  const shot = async (name) => { await shotFile(win, path.join(OUT, name)); };

  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2600);

  /* ---- 1. 默认状态 ---- */
  let rail = await run(JS_RAIL);
  ok(JSON.stringify(rail) === JSON.stringify(DEFAULTS), '默认顺序 = 内置顺序', rail.join(','));
  let ui = await run(`(() => JSON.stringify({
    rows: document.querySelectorAll('#railOrderList .rail-ord-row').length,
    starts: document.querySelectorAll('#startPageList .start-page-opt').length,
    startActive: (document.querySelector('#startPageList .start-page-opt.active') || {}).dataset && document.querySelector('#startPageList .start-page-opt.active').dataset.page,
    lockedEyes: document.querySelectorAll('#railOrderList .rail-ord-row[data-page="home"] .ro-btn[data-act="eye"], #railOrderList .rail-ord-row[data-page="settings"] .ro-btn[data-act="eye"]').length
  }))()`);
  ui = JSON.parse(ui);
  ok(ui.rows === 11, '顺序列表 11 行', 'rows=' + ui.rows);
  ok(ui.starts === 11, '启动页选项 11 个', 'n=' + ui.starts);
  ok(ui.startActive === 'home', '默认启动页 = 主页', 'active=' + ui.startActive);
  ok(ui.lockedEyes === 0, '主页 / 设置 没有「收起」按钮（防锁死）', 'eyes=' + ui.lockedEyes);

  /* ---- 2. ▲ 把「设置」挪到最前 ---- */
  await run(`gotoPage('settings')`);
  await sleep(400);
  await run(`(() => { const r = document.querySelector('#railOrderList .rail-ord-row[data-page="settings"]'); r.querySelector('.ro-btn[data-act="up"]').click(); return true; })()`);
  await sleep(500);
  rail = await run(JS_RAIL);
  ok(rail[9] === 'settings', '点一次 ▲「设置」前移一位到导入之前', rail.join(','));
  for (let i = 0; i < 9; i++) {
    await run(`(() => { const r = document.querySelector('#railOrderList .rail-ord-row[data-page="settings"]'); const b = r.querySelector('.ro-btn[data-act="up"]'); if (b && !b.disabled) b.click(); return true; })()`);
    await sleep(160);
  }
  await sleep(400);
  rail = await run(JS_RAIL);
  ok(rail[0] === 'settings', '连点 ▲ 后「设置」排到第一位', rail.join(','));
  ok((baseCfg.railOrder || [])[0] === 'settings', '顺序已落盘到配置', JSON.stringify(baseCfg.railOrder));
  ui = JSON.parse(await run(`(() => JSON.stringify({
    first: document.querySelector('#railOrderList .rail-ord-row').dataset.page,
    upDisabled: document.querySelector('#railOrderList .rail-ord-row .ro-btn[data-act="up"]').disabled
  }))()`));
  ok(ui.first === 'settings' && ui.upDisabled === true, '设置页列表同步 + 首行 ▲ 置灰', JSON.stringify(ui));

  /* ---- 3. 拖拽排序（真发 DragEvent，走的是界面上的那套监听）---- */
  const dragRes = await run(`(() => {
    const rows = document.querySelectorAll('#railOrderList .rail-ord-row');
    const from = document.querySelector('#railOrderList .rail-ord-row[data-page="settings"]');
    const to = document.querySelector('#railOrderList .rail-ord-row[data-page="tools"]');
    if (!from || !to) return 'no-row';
    try {
      const dt = new DataTransfer();
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      from.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
      return 'ok';
    } catch (e) { return 'err:' + e.message; }
  })()`);
  await sleep(600);
  rail = await run(JS_RAIL);
  ok(dragRes === 'ok' && rail.indexOf('settings') === rail.indexOf('tools') - 1,
    '拖拽「设置」到「工具箱」位置：落在工具箱之前', dragRes + ' → ' + rail.join(','));

  /* ---- 4. 眼睛收起 / 恢复 ---- */
  await run(`(() => { document.querySelector('#railOrderList .rail-ord-row[data-page="download"] .ro-btn[data-act="eye"]').click(); return true; })()`);
  await sleep(450);
  let st = JSON.parse(await run(`(() => {
    const b = document.querySelector('#railNav .rail-btn[data-page="download"]');
    return JSON.stringify({
      hidden: b.classList.contains('rail-hide'),
      visible: b.offsetParent !== null,
      cfg: ${JSON.stringify(baseCfg.railHidden || [])},
      rowOff: document.querySelector('#railOrderList .rail-ord-row[data-page="download"]').classList.contains('off'),
      eyeOff: !!document.querySelector('#railOrderList .rail-ord-row[data-page="download"] .ro-btn.eye.off')
    });
  })()`));
  ok(st.hidden && !st.visible, '「下载」已从侧边栏收起', JSON.stringify(st));
  ok(st.rowOff && st.eyeOff, '设置页对应行标为「已收起」+ 眼睛变斜杠', JSON.stringify(st));
  await run(`(() => { document.querySelector('#railOrderList .rail-ord-row[data-page="download"] .ro-btn[data-act="eye"]').click(); return true; })()`);
  await sleep(400);
  st = JSON.parse(await run(`(() => JSON.stringify({ hidden: document.querySelector('#railNav .rail-btn[data-page="download"]').classList.contains('rail-hide') }))()`));
  ok(st.hidden === false, '再点一次眼睛恢复显示', JSON.stringify(st));

  /* ---- 5. 「全部显示」「恢复默认顺序」 ---- */
  await run(`(() => { document.querySelector('#railOrderList .rail-ord-row[data-page="friends"] .ro-btn[data-act="eye"]').click(); return true; })()`);
  await sleep(350);
  await run(`document.getElementById('btnRailShowAll').click()`);
  await sleep(400);
  ok((baseCfg.railHidden || []).length === 0, '「全部显示」清空收起列表', JSON.stringify(baseCfg.railHidden));
  await run(`document.getElementById('btnRailOrderReset').click()`);
  await sleep(400);
  rail = await run(JS_RAIL);
  ok(JSON.stringify(rail) === JSON.stringify(DEFAULTS), '「恢复默认顺序」回到内置顺序', rail.join(','));

  /* ---- 6. 启动页：设成「实例管理」后重开启动器 ---- */
  await run(`(() => { document.querySelector('#startPageList .start-page-opt[data-page="instances"]').click(); return true; })()`);
  await sleep(400);
  ok(baseCfg.startPage === 'instances', '启动页已落盘 = instances', baseCfg.startPage);
  await win.reload();
  /* 启动页是在 loadConfigUI 之后才切的，固定 sleep 容易卡在遮罩还没撤的窗口期 —— 轮询等它切过去 */
  let boot = null;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    boot = JSON.parse(await run(`(() => JSON.stringify({
      page: (document.querySelector('.page.active') || {}).id,
      railActive: (document.querySelector('#railNav .rail-btn.active') || {}).dataset ? document.querySelector('#railNav .rail-btn.active').dataset.page : null
    }))()`));
    if (boot.page === 'page-instances') break;
  }
  await sleep(400);
  ok(boot.page === 'page-instances' && boot.railActive === 'instances', '重开启动器直接落在「实例管理」', JSON.stringify(boot));
  await shot('rail-custom-startpage.png');

  /* ---- 7. 四个方向：顺序一致 + 不出界 ---- */
  await run(`(() => { gotoPage('settings'); return 'go'; })()`);
  await sleep(300);
  for (const pos of ['left', 'top', 'right', 'bottom']) {
    const clicked = await run(`(() => {
      const b = document.querySelector('.rail-pos[data-pos="${pos}"]');
      if (!b) return 'missing';
      b.click();
      return 'ok';
    })()`);
    if (clicked !== 'ok') { ok(false, pos + ' 方向：找不到位置按钮', clicked); continue; }
    await sleep(500);
    const r = JSON.parse(await run(`(() => {
      const rail = document.getElementById('rail');
      const nav = document.getElementById('railNav');
      const a = document.getElementById('app').getBoundingClientRect();
      const rr = rail.getBoundingClientRect();
      const nr = nav.getBoundingClientRect();
      return JSON.stringify({
        order: Array.prototype.map.call(document.querySelectorAll('#railNav .rail-btn:not(.rail-hide)'), b => b.dataset.page),
        dir: getComputedStyle(nav).flexDirection,
        navInRail: nr.left >= rr.left - 1 && nr.right <= rr.right + 1 && nr.top >= rr.top - 1 && nr.bottom <= rr.bottom + 1,
        railInApp: rr.left >= a.left - 1 && rr.top >= a.top - 1 && rr.right <= a.right + 1 && rr.bottom <= a.bottom + 1,
        scrollable: '${pos}' === 'top' || '${pos}' === 'bottom' ? nav.scrollWidth >= nav.clientWidth : nav.scrollHeight >= nav.clientHeight
      });
    })()`));
    ok(JSON.stringify(r.order) === JSON.stringify(DEFAULTS), pos + ' 方向顺序与默认一致', r.order.join(','));
    ok(r.navInRail && r.railInApp, pos + ' 方向布局不越界（导航在侧栏内 / 侧栏在窗口内）', JSON.stringify(r));
    await shot('rail-custom-' + pos + '.png');
  }

  /* ---- 8. 窄窗口 + 按钮变多：横向侧栏可滚动，仍不越界 ---- */
  await run(`(() => { const b = document.querySelector('.rail-pos[data-pos="top"]'); if (b) b.click(); return 'ok'; })()`);
  await sleep(400);
  await win.setSize(900, 640);
  await sleep(600);
  const measure = () => run(`(() => {
    const nav = document.getElementById('railNav');
    const rail = document.getElementById('rail');
    const rr = rail.getBoundingClientRect();
    const nr = nav.getBoundingClientRect();
    return JSON.stringify({
      navW: Math.round(nr.width), railW: Math.round(rr.width),
      overflowX: nav.scrollWidth > nav.clientWidth,
      navInside: nr.right <= rr.right + 1,
      navH: Math.round(nr.height), railH: Math.round(rr.height)
    });
  })()`).then(JSON.parse);
  /* 11 个内置按钮在 900px 宽下本来就放得下（1.2.4 去掉圆按钮后导航区更宽），
     所以先量「放得下时不越界」，再塞 8 个假按钮逼出滚动，验证「放不下时能滚、仍不越界」 */
  const narrow = await measure();
  ok(narrow.navInside && narrow.navH <= narrow.railH + 1, '窄窗口（900×640）横向侧栏完整在栏内、不越界', JSON.stringify(narrow));
  await run(`(() => {
    const nav = document.getElementById('railNav');
    for (let i = 0; i < 8; i++) {
      const b = document.createElement('button');
      b.className = 'rail-btn tmp-many';
      b.dataset.page = 'tmp-' + i;
      b.innerHTML = '<svg class="ic"><use href="#i-home"/></svg>';
      nav.appendChild(b);
    }
    return nav.children.length;
  })()`);
  await sleep(300);
  const many = await measure();
  ok(many.overflowX && many.navInside, '按钮多到放不下时可左右滚动，且不被挤出窗口', JSON.stringify(many));
  await run(`(() => { document.querySelectorAll('#railNav .tmp-many').forEach(b => b.remove()); return 1; })()`);
  await sleep(200);
  await shot('rail-custom-narrow.png');
  await win.setSize(1360, 940);
  await sleep(400);

  /* ---- 9. 浅色模式看一眼 ---- */
  await run(`document.querySelector('.theme-opt[data-theme="light"]').click()`);
  await sleep(500);
  await run(`(() => { const el = document.getElementById('railOrderList'); el.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(300);
  await shot('rail-custom-light.png');
  await run(`document.querySelector('.theme-opt[data-theme="dark"]').click()`);
  await sleep(300);
  await run(`(() => { const el = document.getElementById('railOrderList'); el.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(300);
  await shot('rail-custom-dark.png');

  console.log('\nRESULT pass=' + PASS + ' fail=' + FAIL);
  app.exit(FAIL ? 1 : 0);
  } catch (e) {
    console.log('THROWN ' + ((e && e.stack) || e));
    app.exit(2);
  }
});
