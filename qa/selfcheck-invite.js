/* 自检 6：基岩版收到邀请 → 同意后会落到哪个页面
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/selfcheck-invite.js
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('mute-audio');

const cfg = { username: 'Steve', appVersion: '1.4.7', seenVersion: '1.4.7', autoCheckUpdate: false,
  theme: 'bedrock', railPosition: 'left', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  activeAccount: 'Steve', railOrder: [], railHidden: [], uiSound: false };
const sends = [];
const stub = {
  'config:get': () => Object.assign({}, cfg), 'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [{ id: '1.21.4-fabric', dir: '1.21.4-fabric', hasJson: true, loader: 'Fabric' }], broken: [], saves: [] }),
  'java:list': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21 }], major: 21 }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21 }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '1.21.4', snapshot: '26.4' }, versions: [] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'update:check': () => ({ ok: true, current: '1.4.7', latest: '1.4.7', hasUpdate: false }),
  'update:cached': () => null, 'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }), 'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:list': () => ({ ok: true, items: [] }),
  'friends:get': () => ({ ok: true, code: 'ABCD-EFGH-JKLM', friends: [{ code: 'WXYZ-2345-6789', name: 'Alex' }] }),
  'friends:presence': () => ({ ok: true, connected: true, status: {} }),
  'friends:signal-send': (_e, p) => { sends.push(p); return { ok: true }; },
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', latest: '0.4.2', outdated: false, running: true, port: 1234, liveVersion: '0.4.2', mismatch: false }),
  'mp:kernel-check': () => ({ ok: true, version: '0.4.2', latest: '0.4.2', outdated: false }),
  'mp:state': () => ({ ok: true, state: { state: 'waiting' } }), 'mp:start': () => ({ ok: true, port: 1234 }),
  'mp:act': () => ({ ok: true, status: 200 }), 'mp:publish-mods': () => ({ ok: true }), 'mp:room-mods': () => ({ ok: false }),
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
  await sleep(2600);
  const js = (c) => win.webContents.executeJavaScript(c, true);
  console.log('body=' + await js(`document.body.className`));
  const took = await js(`JSON.stringify(BEDROCK.invite({ type:'invite', from:'WXYZ-2345-6789', name:'Alex', inviteId:'t1' }))`);
  console.log('BEDROCK.invite 接单: ' + took);
  await sleep(900);
  console.log('弹层: ' + await js(`(() => { const sh=document.getElementById('bdSheet'); return sh ? (sh.innerText||'').replace(/\\s+/g,' ').slice(0,70) : 'NO'; })()`));
  const btn = await js(`(() => { const b=Array.from(document.querySelectorAll('#bdSheet .bd-btn')).find(x=>/同意|加入/.test(x.textContent)); if(!b) return 'NO'; b.click(); return b.textContent.trim(); })()`);
  console.log('点同意: ' + btn);
  await sleep(1600);
  console.log('同意后 body=' + await js(`document.body.className`) + ' page=' + await js(`(document.querySelector('.page.active')||{}).id`));
  console.log('rail display=' + await js(`getComputedStyle(document.getElementById('rail')).display`));
  fs.writeFileSync(path.join(OUT, 'sc-invite-after.png'), (await win.webContents.capturePage()).toPNG());
  console.log('发送信令: ' + JSON.stringify(sends));
  app.exit(0);
});
