/* 自检 2：具体页面的「有没有真的渲染出内容」
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/selfcheck-pages.js
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('mute-audio');

const VERSION = '1.4.7';
const cfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: VERSION, autoCheckUpdate: false, seenVersion: VERSION,
  railPosition: 'left', theme: 'dark', accentColor: '', bgMode: 'default',
  activeAccount: 'Steve', lastVersion: '1.21.4-fabric', startPage: 'home',
  railOrder: [], railHidden: [], uiSound: false, launcherVisibility: 'keep',
  forceChinese: true, forceIsolate: 'auto', defaultVersion: ''
};
const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, broken: [], versions: [
    { id: '1.21.4-fabric', dir: '1.21.4-fabric', hasJson: true, loader: 'Fabric', loaderVer: '0.20.1' },
    { id: '1.21.4', dir: '1.21.4', hasJson: true, loader: 'Vanilla', isBase: true }
  ], saves: [{ name: '新的世界', levelName: '新的世界', instance: '1.21.4-fabric', lastPlayed: 1794900000000 }] }),
  'java:list': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21 }], major: 21 }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21 }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '1.21.4', snapshot: '26.4-snapshot-2' },
    versions: [
      { id: '26.4-snapshot-2', type: 'snapshot', releaseTime: '2026-11-10T10:00:00+00:00' },
      { id: '1.21.4', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' },
      { id: '1.20.1', type: 'release', releaseTime: '2023-06-12T10:00:00+00:00' }
    ] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'update:check': () => ({ ok: true, current: VERSION, latest: VERSION, hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [{ name: '新的世界', levelName: '新的世界', instance: '1.21.4-fabric', lastPlayed: 1794900000000 }] }),
  'modrinth:search': () => ({ ok: true, total: 1, hits: [{ id: 'sodium', title: 'Sodium', titleMain: '钠（Sodium）', descZh: '渲染优化', downloads: 12345, author: 'C' }] }),
  'plugin:list': () => ({ ok: true, items: [] }),
  'friends:get': () => ({ ok: true, code: 'ABCD-EFGH-JKLM', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: true, status: {} }),
  'friends:signal-send': () => ({ ok: true }), 'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', latest: '0.4.2', outdated: false, running: true, port: 1234, liveVersion: '0.4.2', mismatch: false }),
  'mp:kernel-check': () => ({ ok: true, version: '0.4.2', latest: '0.4.2', outdated: false }),
  'mp:state': () => ({ ok: true, state: { state: 'waiting', mode: 'idle' } }),
  'mp:start': () => ({ ok: true, port: 1234 }), 'mp:act': () => ({ ok: true, status: 200 }),
  'mp:download': () => ({ ok: true }), 'mp:publish-mods': () => ({ ok: true }), 'mp:room-mods': () => ({ ok: false }),
  'version:info': () => ({ ok: true, id: '1.21.4-fabric', mcVer: '1.21.4', loader: 'Fabric', loaderVer: '0.20.1' }),
  'diag:launcher': () => ({ ok: true, crashes: [], diagDir: 'D:\\X' }),
  'diag:game': () => ({ ok: true, diag: { found: false, note: '无崩溃日志', rules: [], modsInvolved: [], integrity: null } }),
  'diag:integrity': () => ({ ok: true, integrity: { ok: true, instance: '', total: 0, problems: [], deep: false } }),
  'launch:start': () => ({ started: false, error: 'QA' }), 'launch:stop': () => ({ ok: true }), 'ui:trace': () => ({ ok: true })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, frame: false, width: 1280, height: 880, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true } });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2500);
  const js = (c) => win.webContents.executeJavaScript(c, true);

  const clk = async (sel) => { await js(`(() => { const b = document.querySelector('${sel}'); if (b) b.click(); return true; })()`); await sleep(1000); };
  const dump = async (sel) => JSON.parse(await js(`(() => { const e = document.querySelector('${sel}'); return JSON.stringify({ exists: !!e, n: e ? e.children.length : -1, txt: e ? (e.innerText||'').replace(/\\s+/g,' ').slice(0,140) : '' }); })()`));

  /* 实例页 */
  await clk('#rail .rail-btn[data-page="instances"]');
  console.log('实例列表 #instList: ' + JSON.stringify(await dump('#instList')));

  /* 下载页版本列表 */
  await clk('#rail .rail-btn[data-page="download"]');
  await sleep(1200);
  console.log('版本列表 #verList: ' + JSON.stringify(await dump('#verList')));

  /* 存档页 */
  await clk('#rail .rail-btn[data-page="saves"]');
  console.log('存档列表: ' + JSON.stringify(await dump('#page-saves')));

  /* 好友页 */
  await clk('#rail .rail-btn[data-page="friends"]');
  console.log('好友页: ' + JSON.stringify(await dump('#page-friends')));
  const fr = await js(`(() => { const c=document.getElementById('frCode'); return c ? c.textContent : 'NO'; })()`);
  console.log('好友码显示: ' + fr);

  /* 联机页 */
  await clk('#rail .rail-btn[data-page="mp"]');
  const mp = await js(`(() => { const k=document.getElementById('mpKernelTx'); return k ? k.innerHTML.replace(/<[^>]+>/g,'') : 'NO'; })()`);
  console.log('联机内核行: ' + mp);
  const setupShown = await js(`(() => { const s=document.getElementById('mpSetup'), m=document.getElementById('mpMain'); return JSON.stringify({ setup: s?s.style.display:'-', main: m?m.style.display:'-' }); })()`);
  console.log('联机页 setup/main: ' + setupShown);

  /* 诊断页 */
  await clk('#rail .rail-btn[data-page="diag"]');
  console.log('诊断页: ' + JSON.stringify(await dump('#page-diag')));

  /* 主页按钮数与文本 */
  await clk('#rail .rail-btn[data-page="home"]');
  console.log('主页: ' + JSON.stringify(await dump('#page-home')));

  app.exit(0);
});
