/* 浅色模式配色巡检：把关键页面挨个截图，人工看有没有「没跟着变」的角落
 * 用法：./node_modules/.bin/electron qa/shot-light.js [accentHex]
 * 产物：qa/out/light-*.png */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const ACCENT = String(process.argv[2] || '');
const THEME = String(process.argv[3] || 'light') === 'dark' ? 'dark' : 'light';
const BG = String(process.argv[4] || 'default');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const mk = (id, type) => ({ id, type, releaseTime: '2026-10-0' + ((id.length % 9) + 1) + 'T10:00:00+00:00' });
const versions = ['26.3', '26.2', '26.1', '1.21.11', '1.21.10', '1.21.9'].map(v => mk(v, 'release'))
  .concat(['26.4-snapshot-2'].map(v => mk(v, 'snapshot')));

const baseCfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: '1.2.0', autoCheckUpdate: false, seenVersion: '1.2.0',
  railPosition: 'left', theme: THEME, accentColor: ACCENT, bgMode: BG, activeAccount: 'Steve'
};
const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, patch) => { Object.assign(baseCfg, patch); return Object.assign({}, baseCfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [{ id: '26.3', dir: '26.3', hasJson: true, loader: '' }], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4-snapshot-2' }, versions } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888', friends: [] }),
  'friends:presence': () => ({ ok: true, online: [] }),
  'friends:signal-poll': () => ({ ok: true, items: [] }),
  'mp:status': () => ({ ok: true, installed: false }),
  'update:check': () => ({ ok: true, current: '1.2.0', latest: '1.2.0', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:list': () => ({ ok: true, items: [] })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, frame: false, width: 1240, height: 820, webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2600);

  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, THEME + (BG === 'default' ? '' : '-' + BG) + '-' + name + '.png'), img.toPNG());
  };
  const go = async (page, wait) => {
    await win.webContents.executeJavaScript(`(() => { const b = document.querySelector('.rail-btn[data-page="${page}"]'); if (b) b.click(); return true; })()`, true);
    await sleep(wait || 1100);
  };

  await shot('home');
  await go('download', 1600);
  await shot('download');
  /* 展开一张版本卡的内联安装面板（真正的「开始安装」按钮在那里） */
  const opened = await win.webContents.executeJavaScript(`(() => {
    const head = document.querySelector('.pv-card .pv-head');
    if (!head) return 'no-card';
    head.click();
    return 'clicked';
  })()`, true);
  await sleep(900);
  await win.webContents.executeJavaScript(`(() => { const f = document.querySelector('.pv-foot'); if (f) f.scrollIntoView({ block: 'center' }); return true; })()`, true);
  await sleep(500);
  const hasPanel = await win.webContents.executeJavaScript(`(() => !!document.querySelector('.pv-panel'))()`, true);
  console.log('PANEL ' + opened + ' open=' + hasPanel);
  await shot('download-panel');
  await go('account', 1000);
  await shot('account');
  await go('settings', 1200);
  await win.webContents.executeJavaScript(`(() => { const c = document.querySelector('#page-settings .set-group h2'); if (c) c.scrollIntoView({block:'start'}); return true; })()`, true);
  await sleep(700);
  await shot('settings');

  console.log('ACCENT=' + (ACCENT || '(default)') + ' THEME=' + THEME);
  console.log('SHOTS ' + OUT);
  console.log('DONE');
  app.quit();
});
