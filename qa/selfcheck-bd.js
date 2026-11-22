/* 自检 3：基岩版交互细节（Esc、设置页签、更衣室/切换账户、联机、下载页签）
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/selfcheck-bd.js
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
  railPosition: 'left', theme: 'bedrock', accentColor: '', bgMode: 'default',
  activeAccount: 'Steve', lastVersion: '1.21.4-fabric', startPage: 'home',
  railOrder: [], railHidden: [], uiSound: false, launcherVisibility: 'keep',
  forceChinese: true, forceIsolate: 'auto', defaultVersion: ''
};
const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, broken: [], versions: [
    { id: '1.21.4-fabric', dir: '1.21.4-fabric', hasJson: true, loader: 'Fabric', loaderVer: '0.20.1' },
    { id: '1.21.4', dir: '1.21.4', hasJson: true, loader: 'Vanilla', isBase: true }
  ], saves: [{ name: '新的世界', levelName: '新的世界', instance: '1.21.4-fabric', lastPlayed: 1794900000000 }] }),
  'java:list': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21 }], major: 21 }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21 }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '1.21.4', snapshot: '26.4' },
    versions: [{ id: '1.21.4', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' }] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'update:check': () => ({ ok: true, current: VERSION, latest: VERSION, hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [{ name: '新的世界', levelName: '新的世界', instance: '1.21.4-fabric', lastPlayed: 1794900000000 }] }),
  'modrinth:search': () => ({ ok: true, total: 1, hits: [{ id: 'sodium', title: 'Sodium', titleMain: '钠', descZh: '优化', downloads: 1, author: 'C' }] }),
  'plugin:list': () => ({ ok: true, items: [] }),
  'friends:get': () => ({ ok: true, code: 'ABCD-EFGH-JKLM', friends: [{ code: 'WXYZ-2345-6789', name: 'StarMantis2357' }] }),
  'friends:presence': () => ({ ok: true, connected: true, status: { 'WXYZ-2345-6789': { online: true, lastSeen: Date.now() } } }),
  'friends:signal-send': () => ({ ok: true }), 'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', latest: '0.4.2', outdated: false, running: true, port: 1234, liveVersion: '0.4.2', mismatch: false }),
  'mp:kernel-check': () => ({ ok: true, version: '0.4.2', latest: '0.4.2', outdated: false }),
  'mp:state': () => ({ ok: true, state: { state: 'waiting', mode: 'idle' } }),
  'mp:start': () => ({ ok: true, port: 1234 }), 'mp:act': () => ({ ok: true, status: 200 }),
  'mp:download': () => ({ ok: true }), 'mp:publish-mods': () => ({ ok: true }), 'mp:room-mods': () => ({ ok: false }),
  'version:info': () => ({ ok: true, id: '1.21.4-fabric', mcVer: '1.21.4', loader: 'Fabric', loaderVer: '0.20.1' }),
  'diag:launcher': () => ({ ok: true, crashes: [], diagDir: 'D:\\X' }),
  'diag:game': () => ({ ok: true, diag: { found: false, note: '无崩溃日志', rules: [], modsInvolved: [], integrity: null } }),
  'diag:integrity': () => ({ ok: true, integrity: { ok: true, instance: '', total: 0, problems: [], deep: false } }),
  'launch:start': () => ({ started: false, error: 'QA' }), 'launch:stop': () => ({ ok: true }), 'ui:trace': () => ({ ok: true })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const errs = [];

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, frame: false, width: 1280, height: 880, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true } });
  win.webContents.on('console-message', (_e, lv, msg, line, src) => {
    if (lv >= 3) errs.push('[console] ' + msg + ' @' + String(src || '').split(/[\\/]/).pop() + ':' + line);
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2600);
  const js = (c) => win.webContents.executeJavaScript(c, true);

  console.log('body=' + await js(`document.body.className`));
  console.log('active=' + await js(`(document.querySelector('.page.active')||{}).id`));

  /* Esc 测试：先注入监听器收集错误 */
  await js(`(() => { window.__e=[]; window.addEventListener('error', e => window.__e.push(e.message + ' @' + (e.filename||'').split('/').pop() + ':' + e.lineno)); return true; })()`);

  const esc = async (label) => {
    const before = await js(`window.__e.length`);
    await js(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
    await sleep(400);
    const after = await js(`JSON.stringify(window.__e.slice(${before}))`);
    console.log('Esc(' + label + ') 新增错误: ' + after);
  };
  await esc('主菜单');
  await js(`(() => { BEDROCK.openSheet; document.getElementById('bdSettings').click(); return true; })()`);
  await sleep(900);
  await esc('设置弹层（应关闭）');
  const sheetClosed = await js(`!!document.querySelector('#bdSheet.on')`);
  console.log('  Esc 后弹层仍开? ' + sheetClosed);

  /* 设置页签 */
  const tabs = await js(`(() => { document.getElementById('bdSettings').click(); return true; })()`);
  await sleep(900);
  const tabIds = await js(`Array.from(document.querySelectorAll('#bdSheet .bd-tab')).map(b => b.dataset.tab)`);
  console.log('设置页签: ' + tabIds.join(','));
  for (const t of tabIds) {
    const before = await js(`window.__e.length`);
    await js(`(() => { const b=document.querySelector('#bdSheet .bd-tab[data-tab="${t}"]'); if(b) b.click(); return true; })()`);
    await sleep(700);
    const info = await js(`(() => { const p=document.querySelector('#bdSheet .bd-pane.on'); return JSON.stringify({ pane: p ? p.id : 'none', len: p ? (p.innerText||'').trim().length : 0, head: p ? (p.innerText||'').replace(/\\s+/g,' ').slice(0,50) : '' }); })()`);
    const ne = await js(`window.__e.length`);
    console.log('  tab ' + t + ' → ' + info + (ne > before ? '  ! 抛错 ' + (ne - before) : ''));
  }
  await js(`(() => { BEDROCK.closeSheet && BEDROCK.closeSheet(); return true; })()`);
  await sleep(500);

  /* 更衣室 / 切换账户 chips */
  const chips = await js(`Array.from(document.querySelectorAll('#bdModel .bd-chip, .bd-model-chip, [data-bdmodel]')).map(b => b.textContent.trim())`);
  console.log('右下角色 chips: ' + JSON.stringify(chips));
  const model = await js(`(() => {
    const cv = document.getElementById('bdModel');
    const c = cv ? cv.querySelector('canvas') || cv : null;
    if (!c) return 'no-canvas';
    try { const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for (let i=3;i<d.length;i+=4) if (d[i]>8) n++; return 'pix=' + n + ' size=' + c.width + 'x' + c.height; } catch (e) { return 'err:' + e.message; }
  })()`);
  console.log('右下 3D 角色: ' + model);

  /* 联机弹层里的内核行 vs 设置 */
  await js(`(() => { document.getElementById('bdLan').click(); return true; })()`);
  await sleep(1200);
  console.log('联机弹层: ' + await js(`(() => { const tx=document.getElementById('mpKernelTx'); return tx ? tx.textContent : 'NO'; })()`));
  await js(`(() => { BEDROCK.closeSheet && BEDROCK.closeSheet(); return true; })()`);
  await sleep(500);

  /* 基岩版下载页 9 页签 */
  await js(`(() => { document.getElementById('bdDownload').click(); return true; })()`);
  await sleep(1400);
  console.log('当前页: ' + await js(`(document.querySelector('.page.active')||{}).id`));
  const dlTabs = await js(`Array.from(document.querySelectorAll('#bdDlTabs .bd-tab')).map(b => b.dataset.cat || b.textContent.trim())`);
  console.log('下载页签: ' + JSON.stringify(dlTabs));
  for (const t of dlTabs) {
    const before = await js(`window.__e.length`);
    await js(`(() => { const b=document.querySelector('#bdDlTabs .bd-tab[data-cat="${t}"]'); if(b) b.click(); return true; })()`);
    await sleep(800);
    const info = await js(`(() => { const l=document.querySelector('.bd-dl-list'); const res=document.getElementById('bdDlRes'); return JSON.stringify({ list: l ? l.children.length : -1, res: res ? getComputedStyle(res).display : '-', txt: (l ? (l.innerText||'') : '').replace(/\\s+/g,' ').slice(0,40) }); })()`);
    const ne = await js(`window.__e.length`);
    console.log('  ' + t + ' → ' + info + (ne > before ? '  ! 抛错' : ''));
  }

  console.log('--- 错误汇总 ---');
  console.log(await js(`JSON.stringify([...new Set(window.__e)])`));
  if (errs.length) console.log('console err: ' + JSON.stringify([...new Set(errs)]));
  app.exit(0);
});
