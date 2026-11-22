/* 排查：基岩版 gotoPage('mp') → 弹层 → 关闭 之后 #mpSetup 还在不在 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('mute-audio');

const cfg = { username: 'Steve', appVersion: '1.4.8', seenVersion: '1.4.8', autoCheckUpdate: false,
  theme: 'bedrock', railPosition: 'left', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  activeAccount: 'Steve', railOrder: [], railHidden: [], uiSound: false };
const stub = {
  'config:get': () => Object.assign({}, cfg), 'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [], broken: [], saves: [] }),
  'java:list': () => ({ ok: true, javas: [], major: 0 }), 'java:detect': () => ({ ok: true, javas: [], major: 0 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '1.21.4', snapshot: '26.4' }, versions: [] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'update:check': () => ({ ok: true, current: '1.4.8', latest: '1.4.8', hasUpdate: false }),
  'update:cached': () => null, 'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [], active: '' }), 'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }), 'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:list': () => ({ ok: true, items: [] }),
  'friends:get': () => ({ ok: true, code: 'ABCD-EFGH-JKLM', friends: [] }), 'friends:presence': () => ({ ok: true, connected: true, status: {} }),
  'friends:signal-send': () => ({ ok: true }), 'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: false }), 'mp:state': () => ({ ok: true, state: {} }),
  'mp:start': () => ({ ok: false, error: 'x' }), 'mp:act': () => ({ ok: false, status: 0 }), 'mp:room-mods': () => ({ ok: false }),
  'version:info': () => ({ ok: true }), 'diag:launcher': () => ({ ok: true, crashes: [], diagDir: 'D:\\X' }),
  'diag:game': () => ({ ok: true, diag: { found: false, note: '无', rules: [], modsInvolved: [], integrity: null } }),
  'diag:integrity': () => ({ ok: true, integrity: { ok: true, total: 0, problems: [], deep: false } }),
  'launch:start': () => ({ started: false, error: 'QA' }), 'launch:stop': () => ({ ok: true }), 'ui:trace': () => ({ ok: true })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, frame: false, width: 1280, height: 880, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true } });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2500);
  const js = (c) => win.webContents.executeJavaScript(c, true);
  const state = async (tag) => {
    const r = await js(`JSON.stringify({ page: (document.querySelector('.page.active')||{}).id,
      setup: !!document.getElementById('mpSetup'),
      setupParent: (document.getElementById('mpSetup')||{}).parentElement ? document.getElementById('mpSetup').parentElement.id || document.getElementById('mpSetup').parentElement.className : 'none',
      sheet: BEDROCK.debug().sheet })`);
    console.log(tag + ' ' + r);
  };
  await state('初始');
  await js(`gotoPage('mp')`);
  await sleep(900);
  await state('gotoPage(mp) 后');
  await js(`BEDROCK.close()`);
  await sleep(500);
  await state('关闭弹层后');
  await js(`gotoPage('mp')`);
  await sleep(900);
  await state('第二次 gotoPage(mp)');
  await js(`BEDROCK.close()`);
  await sleep(500);
  await state('第二次关闭后');
  await js(`document.getElementById('bdLan').click()`);
  await sleep(900);
  await state('点主菜单「联机」');
  await js(`BEDROCK.close()`);
  await sleep(500);
  await state('再关闭');
  app.exit(0);
});
