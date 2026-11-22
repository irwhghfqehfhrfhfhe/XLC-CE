/* 测量启动耗时：从 loadFile 到 bootMask 移除（bootDone）的时间 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ROOT = path.join(__dirname, '..');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('in-process-gpu');

const baseCfg = { username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X', appVersion: '1.2-rc1', autoCheckUpdate: false, seenVersion: '1.2-rc1#2', railPosition: 'left' };
const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, patch) => Object.assign({}, baseCfg, patch),
  'update:changelog': () => ({ ok: true, current: '1.2-rc1', entry: null, list: [], unseen: false }),
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => new Promise(r => setTimeout(() => r({ ok: true, versions: [{ id: '1.20.4', folder: '1.20.4', loader: 'vanilla', type: 'release' }], broken: [], saves: [], gameDir: 'D:\\X' }), 400)),
  'java:detect': () => new Promise(r => setTimeout(() => r({ ok: true, javas: [], major: 0 }), 300)),
  'manifest:get': () => new Promise(r => setTimeout(() => r({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: 'x' }, versions: [] } }), 500)),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'X', friends: [] }),
  'friends:presence': () => ({ ok: true, online: [] }),
  'friends:signal-poll': () => ({ ok: true, items: [] }),
  'mp:status': () => ({ ok: true, installed: false }),
  'update:check': () => ({ ok: true, current: '1.2-rc1', latest: '1.2-rc1', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 1360, height: 940, webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  const t0 = Date.now();
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  // 轮询 bootMask 是否移除
  let bootDoneAt = 0;
  for (let i = 0; i < 100; i++) {
    const gone = await win.webContents.executeJavaScript(`(() => {
      const m = document.getElementById('bootMask');
      return !m || m.style.display === 'none' || m.style.opacity === '0' || m.classList.contains('done');
    })()`, true);
    if (gone) { bootDoneAt = Date.now() - t0; break; }
    await sleep(50);
  }
  console.log('BOOT bootDone=' + bootDoneAt + 'ms (从 loadFile 到遮罩移除)');
  // 再等 1s，确认后台任务完成、版本已填充
  await sleep(1000);
  const st = await win.webContents.executeJavaScript(`(() => JSON.stringify({
    verOptions: document.querySelectorAll('#selVersion option').length,
    javaList: document.getElementById('javaList').innerText.slice(0, 20),
    err: window.__err || ''
  }))()`, true);
  console.log('FINAL ' + st);
  app.exit(0);
});
