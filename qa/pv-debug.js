/* 调试：版本页卡片渲染情况 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');

const VERSIONS = [
  { id: '26.3', type: 'release', releaseTime: '2026-09-16T10:00:00+00:00' },
  { id: '26.4-snapshot-2', type: 'snapshot', releaseTime: '2026-10-09T10:00:00+00:00' },
  { id: '1.21.4', type: 'release', releaseTime: '2024-12-03T10:00:00+00:00' },
  { id: '1.21.1', type: 'release', releaseTime: '2024-08-08T10:00:00+00:00' },
  { id: '1.20.4', type: 'release', releaseTime: '2023-12-06T10:00:00+00:00' },
  { id: '1.20.1', type: 'release', releaseTime: '2023-06-12T10:00:00+00:00' }
];
const stub = {
  'config:get': () => ({ username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X', appVersion: '1.2-rc1', updateUrl: '', autoCheckUpdate: false, seenVersion: '1.2-rc1' }),
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [{ id: '1.20.1', loader: 'Fabric', mcVersion: '1.20.1' }], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [], major: 0 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4-snapshot-2' }, versions: VERSIONS } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'X', friends: [] }),
  'friends:presence': () => ({ ok: true, online: [] }),
  'friends:signal-poll': () => ({ ok: true, items: [] }),
  'mp:status': () => ({ ok: true, installed: false }),
  'update:check': () => ({ ok: true, current: '1.2-rc1', latest: '1.2-rc1', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: true, width: 1360, height: 940, webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2800);
  const info = await win.webContents.executeJavaScript(`(async () => {
    gotoPage('download'); dlCat='all'; dlQuery=''; renderVersionList();
    await new Promise(r => setTimeout(r, 300));
    const cards = [...document.querySelectorAll('#verList .pv-card')];
    const first3 = cards.slice(0, 4).map(c => ({ vid: c.dataset.vid, h: c.offsetHeight, w: c.offsetWidth, head: !!c.querySelector('.pv-head'), inner: c.querySelector('.pv-head') ? c.querySelector('.pv-head').offsetHeight : -1 }));
    return JSON.stringify({
      n: cards.length,
      listH: document.getElementById('verList').offsetHeight,
      listCls: document.getElementById('verList').className,
      first3,
      verListChildren: [...document.getElementById('verList').children].map(x => x.className + ':' + x.offsetHeight).slice(0, 8)
    });
  })()`, true);
  console.log('INFO', info);
  /* 展开 1.21.1 */
  const openInfo = await win.webContents.executeJavaScript(`(async () => {
    const c = [...document.querySelectorAll('.pv-card')].find(x => x.dataset.vid === '1.21.1');
    if (!c) return 'no-card';
    c.querySelector('.pv-head').click();
    await new Promise(r => setTimeout(r, 600));
    const p = document.querySelector('.pv-card.open .pv-panel');
    return JSON.stringify({ opened: !!p, h: p ? p.offsetHeight : -1, loaders: p ? p.querySelectorAll('.pv-lo').length : -1 });
  })()`, true);
  console.log('OPEN', openInfo);
  app.exit(0);
});
