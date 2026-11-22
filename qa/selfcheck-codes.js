/* 自检 5：房间码校验口径 + 几个空状态界面
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/selfcheck-codes.js
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('mute-audio');

const cfg = { username: 'Steve', appVersion: '1.4.7', seenVersion: '1.4.7', autoCheckUpdate: false,
  theme: 'dark', railPosition: 'left', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  activeAccount: 'Steve', railOrder: [], railHidden: [], uiSound: false };
const stub = {
  'config:get': () => Object.assign({}, cfg), 'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [], broken: [], saves: [] }),
  'java:list': () => ({ ok: true, javas: [], major: 0 }), 'java:detect': () => ({ ok: true, javas: [], major: 0 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '1.21.4', snapshot: '26.4' }, versions: [] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'update:check': () => ({ ok: true, current: '1.4.7', latest: '1.4.7', hasUpdate: false }),
  'update:cached': () => null, 'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [], active: '' }), 'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }), 'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:list': () => ({ ok: true, items: [] }),
  'friends:get': () => ({ ok: true, code: 'ABCD-EFGH-JKLM', friends: [] }), 'friends:presence': () => ({ ok: true, connected: false, status: {} }),
  'friends:signal-send': () => ({ ok: true }), 'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: false }), 'mp:state': () => ({ ok: true, state: {} }),
  'mp:start': () => ({ ok: false, error: '未安装' }), 'mp:act': () => ({ ok: false, status: 0 }), 'mp:room-mods': () => ({ ok: false }),
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
  await sleep(2400);
  const js = (c) => win.webContents.executeJavaScript(c, true);

  const cases = ['U/R4RT-WNRL-Y4KN-Y1PL', 'u/r4rt-wnrl-y4kn-y1pl', 'R4RT-WNRL-Y4KN-Y1PL', 'U/R4RTWNRLY4KNY1PL',
    'U／R4RT－WNRL－Y4KN－Y1PL', '房间码：U/R4RT-WNRL-Y4KN-Y1PL', 'U/R4RT WNRL Y4KN Y1PL'];
  const out = await js(`JSON.stringify(${JSON.stringify(cases)}.map(v => ({ v, ok: mpRoomCodeValid(v) })))`);
  console.log('房间码校验（渲染层）:');
  JSON.parse(out).forEach(o => console.log('  ' + (o.ok ? '接受 ' : '拒绝 ') + JSON.stringify(o.v) + (o.ok ? ' → ' + o.ok : '')));

  /* 空账户下开更衣室 / 切换账户 */
  await js(`(() => { BEDROCK.setOpt && BEDROCK.setOpt('theme','bedrock'); return true; })()`);
  await sleep(1400);
  console.log('body=' + await js(`document.body.className`));
  const chips = await js(`Array.from(document.querySelectorAll('#bdModel .bd-chip, [data-bdmodel]')).map(b => b.textContent.trim())`);
  console.log('角色 chips=' + JSON.stringify(chips));
  const skins = await js(`(() => { const b=Array.from(document.querySelectorAll('.bd-side-btn, .bd-navitem, .bd-btn')).find(x=>/更衣室/.test(x.textContent)); if(!b) return 'NO-BTN'; b.click(); return 'clicked'; })()`);
  await sleep(900);
  console.log('更衣室: ' + skins + ' / ' + await js(`(() => { const sh=document.getElementById('bdSheet'); return sh ? (sh.innerText||'').replace(/\\s+/g,' ').slice(0,80) : 'NO'; })()`));
  await js(`(() => { BEDROCK.closeSheet && BEDROCK.closeSheet(); return true; })()`);
  await sleep(400);
  const acc = await js(`(() => { const b=Array.from(document.querySelectorAll('.bd-side-btn, .bd-navitem, .bd-btn')).find(x=>/切换账户/.test(x.textContent)); if(!b) return 'NO-BTN'; b.click(); return 'clicked'; })()`);
  await sleep(900);
  console.log('切换账户: ' + acc + ' / ' + await js(`(() => { const sh=document.getElementById('bdSheet'); return sh ? (sh.innerText||'').replace(/\\s+/g,' ').slice(0,80) : 'NO'; })()`));
  app.exit(0);
});
