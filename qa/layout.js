/* 验证新布局：标题栏在窗口最上方横跨全宽 + 侧边栏位置四方位 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const { QA_SHOW, shotFile } = require('./_vis'); /* 默认隐藏窗口，QA_SHOW=1 才弹出来看图 */

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

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
  const win = new BrowserWindow({ show: QA_SHOW, width: 1360, height: 940, webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2800);

  // 1) 标题栏 + 侧边栏几何
  const geo = await win.webContents.executeJavaScript(`(() => {
    const app = document.getElementById('app').getBoundingClientRect();
    const tb = document.getElementById('titlebar').getBoundingClientRect();
    const rail = document.getElementById('rail').getBoundingClientRect();
    const body = document.getElementById('body').getBoundingClientRect();
    const main = document.getElementById('main').getBoundingClientRect();
    return JSON.stringify({
      bodyCls: document.body.className,
      appDir: getComputedStyle(document.getElementById('app')).flexDirection,
      bodyDir: getComputedStyle(document.getElementById('body')).flexDirection,
      titlebar: { top: Math.round(tb.top - app.top), left: Math.round(tb.left - app.left), w: tb.width, h: tb.height, fullWidth: Math.abs(tb.width - app.width) < 2 },
      rail: { top: Math.round(rail.top - app.top), left: Math.round(rail.left - app.left), w: rail.width, h: rail.height },
      bodyTop: Math.round(body.top - app.top),
      main: { left: Math.round(main.left - app.left), top: Math.round(main.top - app.top), w: main.width }
    });
  })()`, true);
  console.log('LAYOUT ' + geo);
  await shotFile(win, path.join(OUT, 'layout-home.png'));

  // 2) 四个方向侧边栏位置
  const positions = ['top', 'right', 'bottom', 'left'];
  for (const pos of positions) {
    const res = await win.webContents.executeJavaScript(`(async () => {
      document.querySelector('.rail-pos[data-pos="${pos}"]').click();
      await new Promise(r => setTimeout(r, 500));
      const app = document.getElementById('app').getBoundingClientRect();
      const rail = document.getElementById('rail').getBoundingClientRect();
      const tb = document.getElementById('titlebar').getBoundingClientRect();
      return JSON.stringify({
        pos: "${pos}",
        railTop: Math.round(rail.top - app.top), railLeft: Math.round(rail.left - app.left),
        railW: rail.width, railH: rail.height,
        tbTop: Math.round(tb.top - app.top), tbW: tb.width
      });
    })()`, true);
    console.log('POS ' + res);
    if (pos === 'bottom' || pos === 'top') await shotFile(win, path.join(OUT, 'layout-' + pos + '.png'));
  }

  console.log('DONE');
  app.exit(0);
});
