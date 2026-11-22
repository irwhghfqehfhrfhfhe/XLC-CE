/* 自检 4：浅色主题 + 基岩版全景/角色动画是否真的在动
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/selfcheck-anim.js
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

const VERSION = '1.4.7';
const cfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: VERSION, autoCheckUpdate: false, seenVersion: VERSION,
  railPosition: 'left', theme: 'light', accentColor: '', bgMode: 'default',
  activeAccount: 'Steve', lastVersion: '1.21.4-fabric', startPage: 'home',
  railOrder: [], railHidden: [], uiSound: false, launcherVisibility: 'keep',
  forceChinese: true, forceIsolate: 'auto', defaultVersion: ''
};
const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, broken: [], versions: [{ id: '1.21.4-fabric', dir: '1.21.4-fabric', hasJson: true, loader: 'Fabric', loaderVer: '0.20.1' }], saves: [] }),
  'java:list': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21 }], major: 21 }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21 }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '1.21.4', snapshot: '26.4' }, versions: [{ id: '1.21.4', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' }] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'update:check': () => ({ ok: true, current: VERSION, latest: VERSION, hasUpdate: false }),
  'update:cached': () => null,
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:list': () => ({ ok: true, items: [] }),
  'friends:get': () => ({ ok: true, code: 'ABCD-EFGH-JKLM', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: true, status: {} }),
  'friends:signal-send': () => ({ ok: true }), 'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', latest: '0.4.2', outdated: false, running: true, port: 1234, liveVersion: '0.4.2', mismatch: false }),
  'mp:kernel-check': () => ({ ok: true, version: '0.4.2', latest: '0.4.2', outdated: false }),
  'mp:state': () => ({ ok: true, state: { state: 'waiting' } }), 'mp:start': () => ({ ok: true, port: 1234 }),
  'mp:act': () => ({ ok: true, status: 200 }), 'mp:publish-mods': () => ({ ok: true }), 'mp:room-mods': () => ({ ok: false }),
  'version:info': () => ({ ok: true, id: '1.21.4-fabric', mcVer: '1.21.4', loader: 'Fabric', loaderVer: '0.20.1' }),
  'diag:launcher': () => ({ ok: true, crashes: [], diagDir: 'D:\\X' }),
  'diag:game': () => ({ ok: true, diag: { found: false, note: '无', rules: [], modsInvolved: [], integrity: null } }),
  'diag:integrity': () => ({ ok: true, integrity: { ok: true, instance: '', total: 0, problems: [], deep: false } }),
  'launch:start': () => ({ started: false, error: 'QA' }), 'launch:stop': () => ({ ok: true }), 'ui:trace': () => ({ ok: true })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, frame: false, width: 1280, height: 880, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true } });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2500);
  const js = (c) => win.webContents.executeJavaScript(c, true);
  const shot = async (n) => { try { win.webContents.invalidate(); } catch (_) {} await sleep(400); fs.writeFileSync(path.join(OUT, n + '.png'), (await win.webContents.capturePage()).toPNG()); };

  console.log('theme=' + await js(`document.body.className`));
  await shot('sc-light-home');

  /* 浅色下检查关键区域的实际配色，找出「深色主题的底 + 浅色文字」这种反色 */
  const colors = await js(`(() => {
    const get = (sel) => { const e = document.querySelector(sel); if (!e) return sel + ':NO'; const s = getComputedStyle(e); return sel + ': bg=' + s.backgroundColor + ' fg=' + s.color; };
    return JSON.stringify(['body','#rail','.page','.card','.btn','#topbar'].map(get));
  })()`);
  console.log('配色 ' + colors);

  await js(`(() => { document.querySelector('#rail .rail-btn[data-page="settings"]').click(); return true; })()`);
  await sleep(900);
  await shot('sc-light-settings');

  /* 深色对照 */
  await js(`(() => { BEDROCK ? null : null; const b=document.querySelector('.theme-opt[data-theme=dark]'); if(b) b.click(); return true; })()`);
  await sleep(600);
  await js(`(() => { const b=document.querySelector('.theme-opt[data-theme=dark]'); if(b) b.click(); return true; })()`);
  await sleep(800);
  await shot('sc-dark-settings');

  /* 基岩版：全景是否真的在转、右下角角色是否在动 */
  await js(`(() => { if (window.BEDROCK && BEDROCK.setOpt) BEDROCK.setOpt('theme','bedrock'); return true; })()`);
  await sleep(1500);
  const pan1 = await js(`(() => { const s=document.querySelector('#page-bedrock .bd-pano-strip'); return s ? s.style.transform : 'NO'; })()`);
  const mod1 = await js(`(() => { const c=document.querySelector('#bdModel canvas')||document.getElementById('bdModel'); if(!c) return 'NO'; try { const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let h=0; for(let i=0;i<d.length;i+=97) h=(h*31+d[i])|0; return 'h'+h; } catch(e){return 'E'} })()`);
  await sleep(2000);
  const pan2 = await js(`(() => { const s=document.querySelector('#page-bedrock .bd-pano-strip'); return s ? s.style.transform : 'NO'; })()`);
  const mod2 = await js(`(() => { const c=document.querySelector('#bdModel canvas')||document.getElementById('bdModel'); if(!c) return 'NO'; try { const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let h=0; for(let i=0;i<d.length;i+=97) h=(h*31+d[i])|0; return 'h'+h; } catch(e){return 'E'} })()`);
  console.log('全景 transform: ' + pan1 + ' → ' + pan2 + (pan1 !== pan2 ? '  ✓在动' : '  ! 没动'));
  console.log('角色像素哈希: ' + mod1 + ' → ' + mod2);
  await shot('sc-bd-home');

  await js(`(() => { document.getElementById('bdSettings').click(); return true; })()`);
  await sleep(900);
  await js(`(() => { const b=document.querySelector('#bdSheet .bd-tab[data-tab="about"]'); if(b) b.click(); return true; })()`);
  await sleep(900);
  console.log('关于页状态: ' + await js(`(() => { const t=document.getElementById('bdUpdStateTx'); return t?t.textContent:'NO'; })()`));
  await shot('sc-bd-about');
  app.exit(0);
});
