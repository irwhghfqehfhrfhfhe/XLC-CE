/* 验证侧边栏（左/右竖排）在最小窗口高度下的纵向适配：按钮区完整在栏内、按钮多时导航区滚动
   （1.2.3 删了侧栏顶部大图标、1.2.4 删了左下角圆按钮，侧栏现在就是纯导航，这里只量导航区）
   用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/rail-fit.js */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const baseCfg = { username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X', appVersion: '1.2.4', autoCheckUpdate: false, seenVersion: '1.2.4', railPosition: 'left', theme: 'dark' };
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

async function measure(win) {
  return await win.webContents.executeJavaScript(`(() => {
    const rail = document.getElementById('rail').getBoundingClientRect();
    const nav = document.getElementById('railNav').getBoundingClientRect();
    const navEl = document.getElementById('railNav');
    const first = document.querySelector('#railNav .rail-btn');
    const last = navEl.lastElementChild;
    const fr = first.getBoundingClientRect(), lr = last.getBoundingClientRect();
    return JSON.stringify({
      rail: { top: Math.round(rail.top), bottom: Math.round(rail.bottom), h: Math.round(rail.height), w: Math.round(rail.width) },
      nav: { top: Math.round(nav.top), bottom: Math.round(nav.bottom) },
      firstVisible: fr.top >= rail.top - 1 && fr.bottom <= rail.bottom + 1,
      navInside: nav.bottom <= rail.bottom + 1 && nav.top >= rail.top - 1,
      navScrollable: navEl.scrollHeight > navEl.clientHeight,
      navScroll: Math.round(navEl.scrollHeight - navEl.clientHeight),
      noAvatar: !document.getElementById('avatar') && !document.querySelector('.rail-bottom') && !document.querySelector('.rail-logo')
    });
  })()`, true);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, frame: false, width: 1000, height: 660, webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2600);

  const a = JSON.parse(await measure(win));
  console.log('MIN660 ' + JSON.stringify(a));
  console.log((a.firstVisible && a.navInside && a.noAvatar ? 'PASS ' : 'FAIL ') + '660 高窗口：导航区完整在侧栏内、无残留按钮/图标');
  /* 删掉顶部大图标 + 左下角圆按钮后，660 高也放得下 11 个按钮 —— 不该出现滚动 */
  console.log((!a.navScrollable ? 'PASS ' : 'FAIL ') + '660 高窗口：11 个按钮无需滚动即完整显示（腾出的空间就是省在这一块）');

  // 加 3 个插件按钮，模拟按钮变多的情况，验证导航区滚动兜底、首个按钮仍可见
  await win.webContents.executeJavaScript(`(() => {
    const nav = document.getElementById('railNav');
    for (let i = 1; i <= 3; i++) {
      const b = document.createElement('button');
      b.className = 'rail-btn'; b.dataset.page = 'plugin-' + i; b.title = '插件' + i;
      b.innerHTML = '<svg class="ic" width="20" height="20"><circle cx="10" cy="10" r="7" fill="currentColor"/></svg>';
      nav.appendChild(b);
    }
    return true;
  })()`, true);
  await sleep(300);
  const b = JSON.parse(await measure(win));
  console.log('PLUS3  ' + JSON.stringify(b));
  console.log((b.navScrollable && b.firstVisible ? 'PASS ' : 'FAIL ') + '加 3 个按钮后导航区仍可滚动、按钮不被裁到栏外');

  const shot = path.join(OUT, 'rail-fit.png');
  await win.webContents.capturePage().then(img => fs.writeFileSync(shot, img.toPNG()));
  console.log('SHOT ' + shot);

  await win.setSize(1220, 780);
  await sleep(600);
  const c = JSON.parse(await measure(win));
  console.log('DEF780 ' + JSON.stringify(c));
  console.log((c.navInside && c.noAvatar ? 'PASS ' : 'FAIL ') + '780 高窗口：布局恢复正常');

  console.log('DONE');
  app.quit();
});
