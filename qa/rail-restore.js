/* 验证 1.2.4 的「回退」：侧边栏回到常驻显示，只删掉极速模式那个圆按钮
   · 侧栏首屏常驻可见、主区紧贴其右侧（并排布局）
   · 没有 railEdge / rail-auto / rail-collapsed / avatar / rail-logo 任何残留
   · 老配置里残留 railAutoHide:true 也不再影响（代码根本不读这个字段）
   · 四个方向切换后侧栏都在窗口内、主区跟着换边
   · 设置页不再有「自动隐藏」开关，四方向选择器仍在且点一下即落盘
   · 深 / 浅色都截图看一遍
   用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/rail-restore.js */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const { QA_SHOW, shotFile } = require('./_vis'); /* 默认隐藏窗口，QA_SHOW=1 才弹出来看图 */

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

/* 故意带上老配置里的 railAutoHide:true —— 1.2.3 的用户配置里就留着这个字段 */
const baseCfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: '1.2.4', autoCheckUpdate: false, seenVersion: '1.2.4', theme: 'dark',
  railPosition: 'left', railOrder: [], railHidden: [], startPage: 'home', railAutoHide: true
};
const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, patch) => { Object.assign(baseCfg, patch); return Object.assign({}, baseCfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({
    ok: true, gameDir: 'D:\\X',
    versions: [{ id: '1.21.4', loader: 'Fabric', children: [] }],
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
process.on('unhandledRejection', (e) => { console.log('UNHANDLED ' + ((e && e.stack) || e)); app.exit(2); });
process.on('uncaughtException', (e) => { console.log('UNCAUGHT ' + ((e && e.stack) || e)); app.exit(2); });
let PASS = 0, FAIL = 0;
const ok = (cond, name, extra) => {
  if (cond) { PASS++; console.log('PASS ' + name + (extra ? '  ' + extra : '')); }
  else { FAIL++; console.log('FAIL ' + name + (extra ? '  ' + extra : '')); }
};

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
  const shot = async (name) => {
    await run(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    await sleep(300);
    await shotFile(win, path.join(OUT, name));
    console.log('SHOT ' + name);
  };
  /* 侧栏 / 主区几何 */
  const geo = () => run(`(() => {
    const r = document.getElementById('rail').getBoundingClientRect();
    const m = document.getElementById('main').getBoundingClientRect();
    return JSON.stringify({ railL: Math.round(r.left), railR: Math.round(r.right), railW: Math.round(r.width),
      mainL: Math.round(m.left), mainT: Math.round(m.top), mainW: Math.round(m.width),
      body: document.body.className, winW: innerWidth, winH: innerHeight });
  })()`).then(JSON.parse);

  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  win.focus();
  await sleep(3600);   /* 等启动遮罩撤掉 */

  /* ---------- 1. 残留清理 ---------- */
  const gone = JSON.parse(await run(`(() => JSON.stringify({
    edge: !!document.getElementById('railEdge'),
    avatar: !!document.getElementById('avatar'),
    railBottom: !!document.querySelector('.rail-bottom'),
    logo: !!document.querySelector('.rail-logo'),
    autoCls: document.body.classList.contains('rail-auto'),
    collapsedCls: document.body.classList.contains('rail-collapsed'),
    turboCls: document.body.classList.contains('turbo'),
    turboCfg: Object.prototype.hasOwnProperty.call(${JSON.stringify(baseCfg)}, 'turboMode'),
    autoHideCfg: Object.prototype.hasOwnProperty.call(${JSON.stringify(baseCfg)}, 'railAutoHide')
  }))()`));
  ok(!gone.edge, '左边缘触发条 #railEdge 已删除');
  ok(!gone.avatar, '左下角圆按钮 #avatar 已删除');
  ok(!gone.railBottom, '侧栏底部 .rail-bottom 空槽位已删除');
  ok(!gone.logo, '侧栏顶部大图标 .rail-logo 保持删除（1.2.3 的删除没错）');
  ok(!gone.autoCls && !gone.collapsedCls, 'body 上没有 rail-auto / rail-collapsed 类');
  ok(!gone.turboCls, 'body 上没有 turbo 类');

  /* ---------- 2. 首屏侧栏常驻（老配置里的 railAutoHide:true 不该起作用） ---------- */
  let g = await geo();
  ok(g.railL === 0 && g.railW >= 40, '侧栏常驻显示在左侧（老配置 railAutoHide:true 不再生效）', 'left=' + g.railL + ' w=' + g.railW);
  ok(Math.abs(g.mainL - g.railR) <= 2, '主区紧贴侧栏右侧（并排布局，不是浮层）', 'main.left=' + g.mainL + ' / rail.right=' + g.railR);
  ok(g.mainW + g.railW >= g.winW - 6, '侧栏 + 主区铺满窗口宽度', 'main=' + g.mainW + ' + rail=' + g.railW + ' / win=' + g.winW);
  const cnt = await run(`document.querySelectorAll('#railNav .rail-btn').length`);
  ok(cnt === 11, '侧栏 11 个按钮齐全', String(cnt));
  await shot('restore-left-dark.png');

  /* ---------- 3. 鼠标乱晃也不会收起（自动隐藏逻辑真的没了） ---------- */
  const move = (x, y) => win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
  await move(4, 300); await sleep(300);
  await move(900, 500); await sleep(600);
  await move(2, 600); await sleep(400);
  g = await geo();
  ok(g.railL === 0 && !/rail-collapsed/.test(g.body), '鼠标反复扫过左边缘 / 主区，侧栏都不收也不抖', 'body=' + g.body.split(' ').filter(c => /rail/.test(c)).join(','));

  /* ---------- 4. 四个方向：侧栏都在窗口内，主区跟着换边 ---------- */
  await run(`(() => { gotoPage('settings'); return 1; })()`);
  await sleep(500);
  for (const pos of ['top', 'right', 'bottom', 'left']) {
    const clicked = await run(`(() => {
      const b = document.querySelector('.rail-pos[data-pos="${pos}"]');
      if (!b) return 'missing';
      b.click(); return 'ok';
    })()`);
    await sleep(600);
    g = await geo();
    const inWin = g.railL >= -1 && g.railR <= g.winW + 1;
    const clsOk = new RegExp('rail-' + pos).test(g.body);
    ok(clicked === 'ok' && clsOk && inWin && g.railW >= 20,
      pos + ' 方向：侧栏可切换、完整显示在窗口内',
      'clicked=' + clicked + ' railL=' + g.railL + ' railR=' + g.railR + ' w=' + g.railW);
    await shot('restore-' + pos + '-dark.png');
  }

  /* ---------- 5. 设置页：开关没了，四方向选择器还在 ---------- */
  const setRows = JSON.parse(await run(`(() => JSON.stringify({
    hideCb: !!document.getElementById('setRailAutoHide'),
    hideRow: !!document.getElementById('railAutoHideRow'),
    posList: document.querySelectorAll('#railPosList .rail-pos').length,
    orderList: !!document.getElementById('railOrderList'),
    startPage: !!document.getElementById('startPageList')
  }))()`));
  ok(!setRows.hideCb && !setRows.hideRow, '设置 → 个性化里「自动隐藏」开关已删除');
  ok(setRows.posList === 4, '「侧边栏位置」四方向选择器仍在（4 个按钮）', String(setRows.posList));
  ok(setRows.orderList && setRows.startPage, '「按钮顺序」「启动页」两张卡仍在');

  /* 位置保存：点「上边」后落盘 */
  await run(`(() => { document.querySelector('.rail-pos[data-pos="top"]').click(); return 1; })()`);
  await sleep(500);
  ok(baseCfg.railPosition === 'top', '切换方向后立即落盘（railPosition=top）', String(baseCfg.railPosition));
  await run(`(() => { document.querySelector('.rail-pos[data-pos="left"]').click(); return 1; })()`);
  await sleep(500);

  /* ---------- 6. 浅色主题 ---------- */
  await run(`(() => { const b = document.querySelector('.theme-opt[data-theme="light"]'); if (b) b.click(); return 1; })()`);
  await sleep(700);
  await run(`(() => { gotoPage('home'); return 1; })()`);
  await sleep(500);
  g = await geo();
  ok(g.railL === 0 && g.railW >= 40, '浅色主题下侧栏照样常驻可见', 'left=' + g.railL + ' w=' + g.railW);
  ok(!g.body.includes('light-bg') === false, '浅色主题类生效（light-bg）', g.body.split(' ').filter(c => /light|dark/.test(c)).join(','));
  await shot('restore-left-light.png');

  console.log('\nRESULT pass=' + PASS + ' fail=' + FAIL);
  app.exit(FAIL ? 1 : 0);
  } catch (e) {
    console.log('THROWN ' + ((e && e.stack) || e));
    app.exit(2);
  }
});
