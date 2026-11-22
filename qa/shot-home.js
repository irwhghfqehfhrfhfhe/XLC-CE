/* 首页主界面截图（用于官网展示） */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('in-process-gpu');

const VERSIONS = [
  { id: '26.3', type: 'release', releaseTime: '2026-09-16T10:00:00+00:00' },
  { id: '1.21.4', type: 'release', releaseTime: '2024-12-03T10:00:00+00:00' },
  { id: '1.20.4', type: 'release', releaseTime: '2023-12-06T10:00:00+00:00' },
  { id: '1.20.1', type: 'release', releaseTime: '2023-06-12T10:00:00+00:00' },
  { id: '1.19.4', type: 'release', releaseTime: '2023-03-14T10:00:00+00:00' },
  { id: '1.16.5', type: 'release', releaseTime: '2021-01-14T10:00:00+00:00' },
  { id: '1.12.2', type: 'release', releaseTime: '2017-09-18T10:00:00+00:00' },
  { id: '1.7.10', type: 'release', releaseTime: '2014-06-26T10:00:00+00:00' }
];

const stub = {
  'config:get': () => ({ username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\PCL\\.minecraft', appVersion: '1.2-rc1', portableMode: false, updateUrl: '', autoCheckUpdate: false, seenVersion: '1.2-rc1' }),
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [{ id: '1.20.1', loader: 'Fabric', mcVersion: '1.20.1' }], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'E:\\jdk21\\bin\\javaw.exe', major: 21 }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4-snapshot-2' }, versions: VERSIONS } }),
  'loader:probe': (_e, kind) => (kind === 'OptiFine' ? { ok: false, why: '无构建' } : { ok: true, builds: 253, loaderVer: '0.16.9' }),
  'loader:builds': (_e, kind) => ({ ok: true, latest: '0.16.9', recommended: '0.16.9', list: [{ v: '0.16.9', tag: '最新' }, { v: '0.16.8' }, { v: '0.16.7' }] }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'ABCD-EFGH-JKLM', friends: [] }),
  'friends:presence': () => ({ ok: true, online: [] }),
  'friends:signal-poll': () => ({ ok: true, items: [] }),
  'mp:status': () => ({ ok: true, installed: false }),
  'update:check': () => ({ ok: true, current: '1.2-rc1', latest: '1.2-rc1', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, current: '1.2-rc1', entry: { version: '1.2-rc1', groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, custom: false, ready: true }),
  'saves:list': () => ({ ok: true, saves: [{ name: '新的世界', instance: '1.20.1' }, { name: '生存存档' }] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: true, width: 1360, height: 940,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(3200);
  const img = await win.webContents.capturePage();
  const f = path.join(OUT, 'home.png');
  fs.writeFileSync(f, img.toPNG());
  console.log('SAVED', f);
  app.exit(0);
});
