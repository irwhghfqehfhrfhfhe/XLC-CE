/* 1.4.15 截图：基岩版「游戏」弹层里的「实例」页签
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/shot-inst.js
 * 产物：qa/out/bd-inst-1415.png（默认：基座被藏）
 *       qa/out/bd-inst-base-1415.png（展开基座）
 *       qa/out/bd-inst-del-1415.png（行内删除确认）
 *       qa/out/bd-inst-narrow-1415.png（1024 窄屏）
 *       qa/out/bd-inst-plain-1415.png（普通模式实例管理页底部那行） */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const cfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: '1.4.15', autoCheckUpdate: false, seenVersion: '1.4.15',
  railPosition: 'left', theme: 'bedrock', accentColor: '', bgMode: 'default', activeAccount: 'Steve',
  uiSound: false, startPage: 'bedrock', bdSky: 'day', lastVersion: '26.3-fabric'
};
const vers = [
  { id: '26.3', folder: '26.3', loader: 'Vanilla', type: 'release', inherits: false, hasJar: true, mcVersion: '26.3', children: ['26.3-fabric'], isBase: true },
  { id: '26.3-fabric', folder: '26.3-fabric', loader: 'Fabric', type: 'release', inherits: true, hasJar: false, mcVersion: '26.3', children: [], isBase: false },
  { id: '1.21.4-forge', folder: '1.21.4-forge', loader: 'Forge', type: 'release', inherits: true, hasJar: false, mcVersion: '1.21.4', children: [], isBase: false },
  { id: '1.20.1-原版生存', folder: '1.20.1-原版生存', loader: 'Vanilla', type: 'release', inherits: false, hasJar: true, mcVersion: '1.20.1', children: [], isBase: false }
];
const broken = [{ folder: '26.2-forge-残', path: 'D:\\X\\versions\\26.2-forge-残', reason: '缺少 26.2-forge-残.json' }];

const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, exists: true, gameDir: cfg.gameDir, versions: vers.map(v => Object.assign({}, v)), broken: broken.map(b => Object.assign({}, b)), saves: [] }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3' }, versions: [{ id: '26.3', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' }] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888-8888', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: false, status: {} }),
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', latest: '0.4.2', outdated: false, running: false, port: 0 }),
  'update:check': () => ({ ok: true, current: '1.4.15', latest: '1.4.15', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'mods:list': () => ({ ok: true, mods: [] }),
  'mods:dir': () => ({ ok: true, dir: 'D:\\X\\mods' }),
  'plugin:list': () => ({ ok: true, plugins: { seedmap: true, server: true, gamepad: true, translator: true }, third: [] }),
  'instance:rename': () => ({ ok: true }),
  'instance:delete': () => ({ ok: true, removed: [] })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let WIN = null;

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false, frame: false, width: 1280, height: 880, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true }
  });
  WIN = win;
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(3200);
  const js = (code) => win.webContents.executeJavaScript(code, true);
  await js(`(() => {
    if (document.getElementById('qaNoAnim')) return true;
    const st = document.createElement('style');
    st.id = 'qaNoAnim';
    st.textContent = '*,*::before,*::after{animation:none !important;transition:none !important}';
    document.head.appendChild(st);
    return true;
  })()`);
  const shot = async (name) => {
    try { win.webContents.invalidate(); } catch (_) {}
    await sleep(450);
    fs.writeFileSync(path.join(OUT, name), (await win.webContents.capturePage()).toPNG());
    console.log('saved qa/out/' + name);
  };

  /* 打开「游戏」弹层 → 实例页签 */
  await js(`(async () => { try { await scanDir(); } catch (_) {} window.BEDROCK.open('game'); })()`);
  await sleep(1500);
  await js(`document.querySelector('#bdSheet .bd-ptab[data-ptab="inst"]').click()`);
  await sleep(900);
  console.log('INST ' + await js(`JSON.stringify(window.BEDROCK.instState())`));
  await shot('bd-inst-1415.png');

  /* 展开基座 */
  await js(`document.querySelector('#bdInstMore [data-iact="showbase"]').click()`);
  await sleep(600);
  console.log('BASE ' + await js(`JSON.stringify(window.BEDROCK.instState())`));
  await shot('bd-inst-base-1415.png');

  /* 行内删除确认（挑加载器那一行，不真删） */
  await js(`document.querySelector('#bdInstList [data-iid="26.3-fabric"] [data-iact="del"]').click()`);
  await sleep(400);
  await shot('bd-inst-del-1415.png');
  await js(`document.querySelector('#bdInstList [data-iact="delno"]').click()`);
  await sleep(300);

  /* 行内改名 */
  await js(`document.querySelector('#bdInstList [data-iid="26.3-fabric"] [data-iact="rename"]').click()`);
  await sleep(400);
  await shot('bd-inst-rename-1415.png');
  await js(`window.BEDROCK.inst()`);

  /* 窄屏 1024 */
  try { win.setContentSize(1024, 760); } catch (_) {}
  await sleep(600);
  console.log('NARROW ' + await js(`(() => {
    const L = document.getElementById('bdInstList');
    const row = L.querySelector('.bd-inst-row');
    return JSON.stringify({
      rows: L.querySelectorAll('.bd-inst-row').length,
      rowH: Math.round(row.getBoundingClientRect().height),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      clipped: Array.from(L.querySelectorAll('.bd-inst-acts')).some(a => a.getBoundingClientRect().right > L.getBoundingClientRect().right + 1)
    });
  })()`));
  await shot('bd-inst-narrow-1415.png');

  /* 普通模式实例管理页：底部那行提示 */
  try { win.setContentSize(1280, 880); } catch (_) {}
  await sleep(400);
  await js(`(async () => { window.BEDROCK.close(); await window.lmc.saveConfig({ theme: 'dark' }); })()`);
  await sleep(1400);
  await js(`gotoPage('instances')`);
  await sleep(900);
  console.log('PLAIN ' + await js(`(() => {
    const n = document.querySelector('#instList .inst-base-note');
    return JSON.stringify({ rows: document.querySelectorAll('#instList .ver-row').length, note: n ? n.textContent.trim() : '' });
  })()`));
  await shot('bd-inst-plain-1415.png');

  console.log('DONE');
  setTimeout(() => { try { win.destroy(); } catch (_) {} app.exit(0); }, 300);
});
