/* 基岩版主题：设置页 / 下载页截图（1.4.9 改版）
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/shot-set-bd.js
 * 产物：qa/out/bd-set-general.png、bd-set-game.png、bd-set-sound.png、bd-dl-new.png */
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
  appVersion: '1.4.9', autoCheckUpdate: false, seenVersion: '1.4.9',
  railPosition: 'left', theme: 'bedrock', accentColor: '', bgMode: 'default', activeAccount: 'Steve',
  uiSound: false, launcherVisibility: 'keep', forceChinese: true, startPage: 'bedrock'
};
const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [{ id: '1.21.4-Fabric', dir: '1.21.4-Fabric', hasJson: true, loader: 'Fabric' }], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4' }, versions: [
    { id: '26.3', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' },
    { id: '26.2', type: 'release', releaseTime: '2026-09-05T10:00:00+00:00' },
    { id: '1.21.4', type: 'release', releaseTime: '2025-12-05T10:00:00+00:00' }
  ] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888-8888', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: true, status: {} }),
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'friends:signal-send': () => ({ ok: true }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', latest: '0.4.2', outdated: false, running: false, port: 0 }),
  'update:check': () => ({ ok: true, current: '1.4.9', latest: '1.4.9', hasUpdate: false }),
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
  const win = new BrowserWindow({
    show: false, frame: false, width: 1280, height: 880, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true }
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(3000);
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
    await sleep(500);
    fs.writeFileSync(path.join(OUT, name), (await win.webContents.capturePage()).toPNG());
    console.log('saved qa/out/' + name);
  };

  await js(`document.getElementById('bdSettings').click()`);
  await sleep(900);
  console.log('SET ' + await js(`(() => {
    const s = document.getElementById('bdSheet');
    return JSON.stringify({ cls: s.className, w: s.offsetWidth, h: s.offsetHeight,
      nav: document.querySelectorAll('#bdSheet .bd-tab').length,
      panes: document.querySelectorAll('#bdSheet .bd-pane').length,
      ttl: (document.querySelector('#bdSheet .bd-ttl') || {}).textContent,
      groups: Array.from(document.querySelectorAll('#bdSheet .bd-nav-grp')).map(e => e.textContent),
      bar: getComputedStyle(document.querySelector('#bdSheet .bd-set-top')).backgroundColor });
  })()`));
  await shot('bd-set-general.png');

  await js(`document.querySelector('#bdSheet .bd-tab[data-tab="game"]').click()`);
  await sleep(400);
  await shot('bd-set-game.png');

  await js(`document.querySelector('#bdSheet .bd-tab[data-tab="sound"]').click()`);
  await sleep(400);
  await shot('bd-set-sound.png');

  await js(`document.querySelector('#bdSheet .bd-tab[data-tab="diag"]').click()`);
  await sleep(700);
  await shot('bd-set-diag.png');

  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(500);
  await js(`gotoPage('bedrock-dl')`);
  await sleep(1600);
  console.log('DL ' + await js(`(() => {
    const t = document.querySelector('#page-bedrock-dl .bd-dl-top');
    const cs = getComputedStyle(t);
    return JSON.stringify({ bar: cs.backgroundColor, h: t.offsetHeight, ttl: getComputedStyle(document.querySelector('#bdDlTtl')).color });
  })()`));
  await shot('bd-dl-new.png');

  await js("document.querySelector('#bdDlTabs .bd-segbtn[data-cat=\"mod\"]').click()");
  await sleep(1800);
  await shot('bd-dl-mod.png');

  win.setContentSize(1024, 640);
  await sleep(800);
  await js('document.getElementById("bdSettings").click()');
  await sleep(700);
  await shot('bd-set-small.png');
  await js("document.querySelector('#bdSheet [data-close]').click()");
  await sleep(400);
  await js("gotoPage('bedrock-dl')");
  await sleep(1200);
  await shot('bd-dl-small.png');

  app.exit(0);
});
