/* 自检：把每个页面 / 页签 / 弹层依次点一遍，收集渲染层报错与异常空白页
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/selfcheck-crawl.js
 * 产物：qa/out/selfcheck-crawl.log（同时打到 stdout）
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
  railPosition: 'left', theme: 'dark', accentColor: '', bgMode: 'default',
  activeAccount: 'Steve', lastVersion: '1.21.4-fabric', startPage: 'home',
  railOrder: [], railHidden: [], uiSound: false, uiSoundVol: 0.5,
  launcherVisibility: 'keep', forceChinese: true, forceIsolate: 'auto', defaultVersion: ''
};
const accounts = [{ name: 'Steve', type: 'offline', model: 'classic', skin: false, skinUrl: '' }];

const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({
    ok: true, broken: [], versions: [
      { id: '1.21.4-fabric', dir: '1.21.4-fabric', hasJson: true, loader: 'Fabric', loaderVer: '0.20.1' },
      { id: '1.21.4', dir: '1.21.4', hasJson: true, loader: 'Vanilla', isBase: true }
    ],
    saves: [
      { name: '新的世界', levelName: '新的世界', instance: '1.21.4-fabric', lastPlayed: 1794900000000 },
      { name: '老存档', levelName: '我的世界（1）', instance: '1.21.4-fabric', lastPlayed: 1794000000000 }
    ]
  }),
  'java:list': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21 }], major: 21 }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: {
    latest: { release: '1.21.4', snapshot: '26.4-snapshot-2' },
    versions: [
      { id: '26.4-snapshot-2', type: 'snapshot', releaseTime: '2026-11-10T10:00:00+00:00' },
      { id: '1.21.4', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' },
      { id: '1.20.1', type: 'release', releaseTime: '2023-06-12T10:00:00+00:00' }
    ] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'update:check': () => ({ ok: true, current: VERSION, latest: VERSION, hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts, active: cfg.activeAccount }),
  'account:switch': (_e, p) => ({ ok: true, accounts, active: p && p.name }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [
    { name: '新的世界', levelName: '新的世界', instance: '1.21.4-fabric', lastPlayed: 1794900000000, icon: null }
  ] }),
  'modrinth:search': (_e, p) => {
    const type = (p && p.type) || 'mod';
    const one = {
      mod: { id: 'sodium', title: 'Sodium', titleMain: '钠（Sodium）', descZh: '渲染优化', downloads: 12345, author: 'CaffeineMC' },
      modpack: { id: 'fo', title: 'Fabulously Optimized', titleMain: 'FO', descZh: '优化整合包', downloads: 4321, author: 'R' },
      resourcepack: { id: 'faithful', title: 'Faithful 32x', titleMain: 'Faithful', descZh: '高清化', downloads: 765, author: 'F' },
      shader: { id: 'comp', title: 'Complementary', titleMain: 'Complementary', descZh: '写实光影', downloads: 321, author: 'E' },
      datapack: { id: 'terra', title: 'Terralith', titleMain: 'Terralith', descZh: '地形', downloads: 210, author: 'S' }
    };
    const h = one[type] ? [one[type]] : [];
    return { ok: true, total: h.length, hits: h };
  },
  'plugin:list': () => ({ ok: true, items: [] }),
  'friends:get': () => ({ ok: true, code: 'ABCD-EFGH-JKLM', friends: [
    { code: 'WXYZ-2345-6789', name: 'StarMantis2357' }
  ] }),
  'friends:presence': () => ({ ok: true, connected: true, status: {} }),
  'friends:signal-send': () => ({ ok: true }),
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'friends:add': () => ({ ok: true, friends: [] }),
  'friends:remove': () => ({ ok: true, friends: [] }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', latest: '0.4.2', outdated: false, running: true, port: 1234, liveVersion: '0.4.2', mismatch: false }),
  'mp:kernel-check': () => ({ ok: true, version: '0.4.2', latest: '0.4.2', outdated: false }),
  'mp:state': () => ({ ok: true, state: { state: 'waiting', mode: 'idle' } }),
  'mp:start': () => ({ ok: true, port: 1234 }),
  'mp:act': () => ({ ok: true, status: 200 }),
  'mp:download': () => ({ ok: true, version: '0.4.2' }),
  'mp:publish-mods': () => ({ ok: true }),
  'mp:room-mods': () => ({ ok: false, error: 'no' }),
  'version:info': () => ({ ok: true, id: '1.21.4-fabric', mcVer: '1.21.4', loader: 'Fabric', loaderVer: '0.20.1' }),
  'diag:launcher': () => ({ ok: true, crashes: [], diagDir: 'D:\\X' }),
  'diag:game': () => ({ ok: true, diag: { found: false, note: '无崩溃日志', rules: [], modsInvolved: [], integrity: null } }),
  'diag:integrity': () => ({ ok: true, integrity: { ok: true, instance: '', total: 0, problems: [], deep: false } }),
  'launch:start': () => ({ started: false, error: 'QA 不真的启动游戏' }),
  'launch:stop': () => ({ ok: true }),
  'ui:trace': () => ({ ok: true })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const errors = [];

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false, frame: false, width: 1280, height: 880, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true }
  });

  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) errors.push('[console] ' + message + ' @' + String(source || '').split(/[\\/]/).pop() + ':' + line);
  });
  win.webContents.on('render-process-gone', (_e, d) => errors.push('[render-gone] ' + JSON.stringify(d)));
  win.webContents.on('preload-error', (_e, p, err) => errors.push('[preload] ' + p + ' ' + err.message));

  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2400);
  const js = (code) => win.webContents.executeJavaScript(code, true);

  /* 收集未捕获异常 */
  await js(`(() => {
    window.__qaErrs = window.__qaErrs || [];
    window.addEventListener('error', e => window.__qaErrs.push('error: ' + (e.message || '') + ' @' + (e.filename||'').split('/').pop() + ':' + e.lineno));
    window.addEventListener('unhandledrejection', e => window.__qaErrs.push('reject: ' + ((e.reason && (e.reason.message || e.reason)) || '')));
    return true;
  })()`);

  /* ---- 1. 遍历侧栏所有页面 ---- */
  const pages = await js(`Array.from(document.querySelectorAll('#rail .rail-btn')).map(b => b.dataset.page)`);
  log('侧栏页面: ' + pages.join(', '));
  for (const p of pages) {
    const before = errors.length;
    await js(`(() => { const b = document.querySelector('#rail .rail-btn[data-page="${p}"]'); if (b) b.click(); return true; })()`);
    await sleep(900);
    const info = await js(`(() => {
      const act = document.querySelector('.page.active');
      const t = act ? (act.innerText || '').trim() : '';
      const hidden = act ? (act.offsetParent === null && getComputedStyle(act).display === 'none') : true;
      return JSON.stringify({ id: act ? act.id : '', len: t.length, text: t.slice(0, 60).replace(/\\s+/g, ' '), hidden });
    })()`);
    const o = JSON.parse(info);
    if (o.id !== 'page-' + p && !(p === 'saves' && o.id === 'page-saves')) log('  ! 页面不匹配: 点 ' + p + ' 后是 ' + o.id);
    if (o.len < 40) log('  ! 内容过少(' + o.len + '): ' + o.id + ' 「' + o.text + '」');
    else log('  - ' + o.id + ' ok (' + o.len + ' 字)');
    if (errors.length > before) log('  ! 本页新增报错 ' + (errors.length - before) + ' 条');
  }

  /* ---- 2. 下载页 9 个页签 ---- */
  await js(`document.querySelector('#rail .rail-btn[data-page="download"]').click()`);
  await sleep(900);
  const tabs = await js(`Array.from(document.querySelectorAll('#dlTabs .seg-btn, #dlTabs button')).map(b => b.textContent.trim())`);
  log('下载页页签: ' + tabs.join('|'));
  for (let i = 0; i < tabs.length; i++) {
    const before = errors.length;
    await js(`(() => { const bs = document.querySelectorAll('#dlTabs .seg-btn, #dlTabs button'); if (bs[${i}]) bs[${i}].click(); return true; })()`);
    await sleep(700);
    const st = await js(`(() => {
      const ids = ['dlList','resList','mpList','rpList','spList','dpList'];
      return JSON.stringify(ids.map(id => { const e = document.getElementById(id); return e ? (e.offsetParent !== null ? 'shown' : 'hid') + ':' + (e.children.length) : '-'; }));
    })()`);
    log('  页签[' + i + '] ' + tabs[i] + ' → ' + st + (errors.length > before ? '  ! 报错+' + (errors.length - before) : ''));
  }

  /* ---- 3. 设置页：滚到底、点每个按钮不炸 ---- */
  await js(`document.querySelector('#rail .rail-btn[data-page="settings"]').click()`);
  await sleep(900);
  const setInfo = await js(`(() => {
    const pg = document.getElementById('page-settings');
    const cards = pg.querySelectorAll('.set-card').length;
    const btns = pg.querySelectorAll('button').length;
    return JSON.stringify({ cards, btns, h: pg.scrollHeight });
  })()`);
  log('设置页: ' + setInfo);

  /* ---- 4. 基岩版：主菜单每个按钮 ---- */
  const before4 = errors.length;
  await js(`(() => { if (window.BEDROCK && BEDROCK.setOpt) BEDROCK.setOpt('theme','bedrock'); else document.getElementById('btnBedrockTheme').click(); return true; })()`);
  await sleep(1200);
  const bdOk = await js(`document.body.classList.contains('bedrock-mode')`);
  log('切基岩版: ' + (bdOk ? 'OK' : '失败'));
  if (bdOk) {
    const ids = await js(`Array.from(document.querySelectorAll('.bd-mbtn')).map(b => b.id)`);
    log('主菜单按钮: ' + ids.join(','));
    for (const id of ids) {
      const before = errors.length;
      await js(`(() => { const b = document.getElementById('${id}'); if (b) b.click(); return true; })()`);
      await sleep(900);
      const s = await js(`(() => { const sh = document.getElementById('bdSheet'); return JSON.stringify({ open: !!(sh && sh.classList.contains('on')), page: (document.querySelector('.page.active')||{}).id, title: sh ? (sh.innerText||'').slice(0,28).replace(/\\s+/g,' ') : '' }); })()`);
      log('  ' + id + ' → ' + s + (errors.length > before ? '  ! 报错+' + (errors.length - before) : ''));
      await js(`(() => { const c = document.querySelector('#bdSheet .bd-x, #bdSheet .bd-close, #bdSheet [data-bd-close]'); if (c) c.click(); else if (window.BEDROCK && BEDROCK.closeSheet) BEDROCK.closeSheet(); return true; })()`);
      await sleep(500);
    }
  }
  if (errors.length > before4) log('  ! 基岩版新增报错 ' + (errors.length - before4) + ' 条');

  /* ---- 5. 未捕获异常汇总 ---- */
  const jsErrs = await js(`JSON.stringify(window.__qaErrs || [])`).catch(() => '[]');
  const list = JSON.parse(jsErrs || '[]');

  log('');
  log('===== 汇总 =====');
  log('console 报错 ' + errors.length + ' 条');
  [...new Set(errors)].slice(0, 30).forEach(e => log('  ' + e));
  log('未捕获异常 ' + list.length + ' 条');
  [...new Set(list)].slice(0, 30).forEach(e => log('  ' + e));

  fs.writeFileSync(path.join(OUT, 'selfcheck-crawl.log'), lines.join('\n'), 'utf8');
  app.exit(0);
});
