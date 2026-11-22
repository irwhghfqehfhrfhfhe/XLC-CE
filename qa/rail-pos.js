/* 验证侧边栏四方位切换（设置 → 个性化 → 侧边栏位置） */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const { QA_SHOW, shotFile } = require('./_vis'); /* 默认隐藏窗口，QA_SHOW=1 才弹出来看图 */

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const baseCfg = { username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X', appVersion: '1.2-rc1', updateUrl: '', autoCheckUpdate: false, seenVersion: '1.2-rc1', railPosition: 'left', railAutoHide: false };
const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, patch) => Object.assign({}, baseCfg, patch),
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
  const L = [];
  const init = await win.webContents.executeJavaScript(`(() => JSON.stringify({
    bodyCls: document.body.className,
    appDir: getComputedStyle(document.getElementById('app')).flexDirection,
    railW: document.getElementById('rail').offsetWidth,
    railH: document.getElementById('rail').offsetHeight
  }))()`, true);
  L.push('INIT ' + init);

  // 设置页：截图确认新卡片存在
  await win.webContents.executeJavaScript(`gotoPage('settings'); true`);
  await sleep(700);
  const hasCard = await win.webContents.executeJavaScript(`(() => {
    const g = document.getElementById('railPosList');
    return JSON.stringify({ card: !!g, n: g ? g.querySelectorAll('.rail-pos').length : 0 });
  })()`, true);
  L.push('CARD ' + hasCard);
  await win.webContents.executeJavaScript(`document.getElementById('content').scrollTop = document.getElementById('page-personal').offsetTop; true`);
  await sleep(300);
  await shotFile(win, path.join(OUT, 'rail-settings.png'));

  // 回到主页验证四个方向的实际布局
  await win.webContents.executeJavaScript(`gotoPage('home'); true`);
  await sleep(400);
  const positions = ['left', 'top', 'right', 'bottom'];
  for (const pos of positions) {
    const res = await win.webContents.executeJavaScript(`(async () => {
      document.querySelector('.rail-pos[data-pos="${pos}"]').click();
      await new Promise(r => setTimeout(r, 500));
      const rail = document.getElementById('rail'), app = document.getElementById('app');
      const btn = document.querySelector('#railNav .rail-btn.active');
      const r = rail.getBoundingClientRect(), a = app.getBoundingClientRect();
      return JSON.stringify({
        pos: "${pos}",
        bodyCls: document.body.className,
        appDir: getComputedStyle(app).flexDirection,
        railX: Math.round(r.left - a.left), railY: Math.round(r.top - a.top),
        railW: rail.offsetWidth, railH: rail.offsetHeight,
        active: btn ? btn.dataset.page : null
      });
    })()`, true);
    L.push('POS ' + res);
    await shotFile(win, path.join(OUT, 'rail-' + pos + '.png'));
  }
  console.log('RAILPOS\n' + L.join('\n'));
  app.exit(0);
});
