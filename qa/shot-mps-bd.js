/* 基岩版主题：联机「核对 / 补齐模组」弹窗截图
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/shot-mps-bd.js
 * 产物：qa/out/mps-bd-dialog.png（基岩版）+ qa/out/mps-dark-dialog.png（深色对照） */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const THEME = process.env.SHOT_THEME || 'bedrock';
const NAME = process.env.SHOT_NAME || (THEME === 'bedrock' ? 'mps-bd-dialog.png' : 'mps-dark-dialog.png');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const baseCfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: '1.4.6', autoCheckUpdate: false, seenVersion: '1.4.6',
  railPosition: 'left', theme: THEME, accentColor: '', bgMode: 'default', activeAccount: 'Steve',
  uiSound: false
};

const host = { name: 'Alex', inst: '1.21.4-Fabric', mc: '1.21.4', ld: 'Fabric', count: 5 };
const mine = { inst: '1.21.4-Fabric', mc: '1.21.4', ld: 'Fabric' };
const missA = { f: 'sodium-0.6.5.jar', h: 'a'.repeat(40), s: 812345, i: 'sodium', v: '0.6.5' };
const missB = { f: 'iris-1.8.0.jar', h: 'b'.repeat(40), s: 2345678, i: 'iris', v: '1.8.0' };
const missC = { f: 'lithium-0.14.3.jar', h: 'c'.repeat(40), s: 634211, i: 'lithium', v: '0.14.3' };

const ST = { delivered: false };

const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, p) => { Object.assign(baseCfg, p); return Object.assign({}, baseCfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [{ id: '1.21.4-Fabric', dir: '1.21.4-Fabric', hasJson: true, loader: 'Fabric' }], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4' }, versions: [{ id: '1.21.4-Fabric', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' }] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888-8888', friends: [{ code: 'AAA-1111-2222', name: 'Alex' }] }),
  'friends:presence': () => ({ ok: true, connected: true, status: { 'AAA-1111-2222': { online: true, lastSeen: Date.now() } } }),
  'friends:signal-poll': () => {
    if (!ST.delivered) {
      ST.delivered = true;
      return { ok: true, signals: [{ type: 'room', room: 'U/AAAA-BBBB-CCCC-DDDD', from: 'AAA-1111-2222', name: 'Alex', mpact: 'z1:stub' }] };
    }
    return { ok: true, signals: [] };
  },
  'friends:signal-send': () => ({ ok: true }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', running: true, port: 1234 }),
  'mp:start': () => ({ ok: true, port: 1234 }),
  'mp:state': () => ({ ok: true, state: { state: 'guest-ok', room: 'U/AAAA-BBBB-CCCC-DDDD', url: '10.0.0.2:25565', difficulty: 'SIMPLE' } }),
  'mp:act': () => ({ ok: true, status: 200 }),
  'mp:mod-manifest': () => ({ ok: true, wire: 'z1:stub', count: 5, mc: '1.21.4', loader: 'Fabric', instance: '1.21.4-Fabric' }),
  'mp:mods-diff': () => ({
    ok: true, host, mine,
    missing: [missA, missB, missC],
    outdated: [{ host: { f: 'fabric-api-0.92.jar', v: '0.92' }, local: { name: 'fabric-api-0.90.jar', version: '0.90' } }],
    same: 1
  }),
  'mp:mods-install': () => ({ ok: true, total: 3, installed: 3, existed: 0, failed: [], manual: [] }),
  'mp:publish-mods': () => ({ ok: true }),
  'mp:room-mods': () => ({ ok: false, error: '超时' }),
  'update:check': () => ({ ok: true, current: '1.4.6', latest: '1.4.6', hasUpdate: false }),
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
    show: false, frame: false, width: 1240, height: 820, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true }
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2800);
  const js = (code) => win.webContents.executeJavaScript(code, true);

  for (let i = 0; i < 40 && !(await js('!!document.getElementById("modSyncMask")')); i++) await sleep(500);
  const shown = await js('!!document.getElementById("modSyncMask")');
  console.log('dialog=' + shown);
  if (!shown) { app.exit(1); return; }

  await js(`(() => {
    if (document.getElementById('qaNoAnim')) return true;
    const st = document.createElement('style');
    st.id = 'qaNoAnim';
    st.textContent = '*,*::before,*::after{animation:none !important;transition:none !important}';
    document.head.appendChild(st);
    return true;
  })()`);
  try { win.webContents.invalidate(); } catch (_) {}
  await sleep(600);

  const dbg = await js(`(() => {
    const m = document.getElementById('modSyncMask');
    const inner = m.querySelector('.modal') || m.querySelector('.mps');
    const b = (sel) => { const e = m.querySelector(sel); return e ? getComputedStyle(e).backgroundColor + ' / ' + getComputedStyle(e).color : null; };
    return JSON.stringify({
      body: document.body.className,
      rows: m.querySelectorAll('.mps-row').length,
      title: (m.querySelector('h3') || {}).textContent,
      modal: b('.modal'), go: b('#mpsGo'), cancel: b('#mpsCancel')
    });
  })()`);
  console.log('INFO ' + dbg);

  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, NAME), img.toPNG());
  console.log('saved qa/out/' + NAME);
  app.exit(0);
});
