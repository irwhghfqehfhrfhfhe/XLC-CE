/* 验证最大化/还原不卡死（backdrop-filter 已移除，软件渲染下不应卡） */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();   // 模拟启动器的软件渲染环境
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('in-process-gpu');

const baseCfg = { username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X', appVersion: '1.2-rc1', autoCheckUpdate: false, seenVersion: '1.2-rc1', railPosition: 'left' };
const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, patch) => { Object.assign(baseCfg, patch); return Object.assign({}, baseCfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [], major: 0 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4-snapshot-2' }, versions: [] } }),
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
  const win = new BrowserWindow({ show: true, width: 1220, height: 780, webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2500);

  const t0 = Date.now();
  let responsive = true;
  // 连续最大化/还原 5 次，每次检查渲染进程是否响应（executeJavaScript 能否在超时内返回）
  for (let i = 0; i < 5; i++) {
    win.maximize();
    await sleep(600);
    let ok = true;
    try {
      const st = await Promise.race([
        win.webContents.executeJavaScript(`(() => JSON.stringify({
          maximized: document.body.classList.contains('maximized'),
          appW: document.getElementById('app').offsetWidth,
          appH: document.getElementById('app').offsetHeight,
          vw: window.innerWidth, vh: window.innerHeight,
          bgColor: getComputedStyle(document.body).backgroundColor
        }))()`, true),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500))
      ]);
      if (i === 0) console.log('MAX-STATE ' + st);
    } catch (_) { ok = false; }
    win.unmaximize();
    await sleep(400);
    responsive = responsive && ok;
    console.log('MAX-CYCLE ' + i + ' responsive=' + ok);
  }
  fs.writeFileSync(path.join(OUT, 'maximize.png'), (await win.webContents.capturePage()).toPNG());
  console.log('MAXIMIZE responsive=' + responsive + ' elapsed=' + (Date.now() - t0) + 'ms');
  app.exit(0);
});
