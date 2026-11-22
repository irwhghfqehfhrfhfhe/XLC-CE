/* 实例列表「基座」标注 + 删除链路截图/校验
 * 用法：./node_modules/.bin/electron qa/shot-base.js
 * 产物：qa/out/instances-base.png、qa/out/instances-base-light.png
 * 校验：基座 badge 是否显示、v-date 是否写「被 N 个实例依赖」、删除基座能否走 cascade。
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const THEME = process.env.QA_THEME || 'dark';

const baseCfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\XLC',
  appVersion: '1.2.0', autoCheckUpdate: false, seenVersion: '1.2.0',
  railPosition: 'left', theme: THEME, accentColor: '', bgMode: 'default', activeAccount: 'Steve'
};

const base = (id, children) => ({
  id, folder: id, loader: 'Vanilla', type: 'release', inherits: false, hasJar: true,
  mcVersion: id, children: children || [], isBase: !!(children && children.length)
});

const ST = {
  versions: [
    base('26.3', ['26.3-fabric-0.18.1']),
    { id: '26.3-fabric-0.18.1', folder: '26.3-fabric-0.18.1', loader: 'Fabric', type: 'release', inherits: true, hasJar: false, mcVersion: '26.3', children: [], isBase: false },
    base('26.4'),
    { id: '26.4-fabric-0.18.1', folder: '26.4-fabric-0.18.1', loader: 'Fabric', type: 'release', inherits: true, hasJar: false, mcVersion: '26.4', children: [], isBase: false }
  ],
  /* 模拟「界面拿到的数据过期」：scan 不再带 children，删除时主进程才返回 HAS_CHILDREN */
  stale: false,
  forceHasChildren: false,
  delCalls: []
};

const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, p) => { Object.assign(baseCfg, p); return Object.assign({}, baseCfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({
    gameDir: baseCfg.gameDir, exists: true, broken: [],
    saves: [],
    versions: ST.versions.map(v => (ST.stale && v.isBase ? Object.assign({}, v, { children: [], isBase: false }) : v))
  }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.4', snapshot: '26.5' }, versions: [] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888-8888', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: false, status: {} }),
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'update:check': () => ({ ok: true, current: '1.2.0', latest: '1.2.0', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:list': () => ({ ok: true, items: [] }),
  'ui:confirm': () => ({ ok: true, smoke: true }),
  'ui:trace': () => ({ ok: true }),
  'instance:delete': (_e, p) => {
    ST.delCalls.push({ id: p && p.id, cascade: !!(p && p.cascade) });
    if (p && p.id === '26.3' && !(p && p.cascade) && ST.forceHasChildren) {
      return { ok: false, code: 'HAS_CHILDREN', id: '26.3', children: ['26.3-fabric-0.18.1'],
        error: '「26.3」被 26.3-fabric-0.18.1 继承（作为原版基座），单独删除会让这些实例启动不了' };
    }
    return { ok: true, removed: (p && p.cascade) ? ['26.3-fabric-0.18.1'] : [], orphanBase: '' };
  }
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
  await sleep(2600);
  const js = (code) => win.webContents.executeJavaScript(code, true);

  await js(`(() => {
    if (document.getElementById('qaNoAnim')) return true;
    const st = document.createElement('style');
    st.id = 'qaNoAnim';
    st.textContent = '*,*::before,*::after{animation:none !important;transition:none !important}';
    document.head.appendChild(st);
    return true;
  })()`);
  await js(`gotoPage('instances')`);
  await sleep(700);

  const info = JSON.parse(await js(`(() => {
    const rows = [...document.querySelectorAll('#instList .ver-row')];
    const find = (id) => rows.find(r => (r.querySelector('.v-name') || {}).textContent?.startsWith(id));
    const baseRow = find('26.3');
    return JSON.stringify({
      rows: rows.length,
      baseBadge: baseRow ? (baseRow.querySelector('.badge.base') || {}).textContent : null,
      baseDate: baseRow ? (baseRow.querySelector('.v-date') || {}).textContent : null,
      baseTitle: baseRow && baseRow.querySelector('.badge.base') ? baseRow.querySelector('.badge.base').title : '',
      kidBadge: find('26.3-fabric-0.18.1') ? !!find('26.3-fabric-0.18.1').querySelector('.badge.base') : null
    });
  })()`));
  console.log('INFO ' + JSON.stringify(info));

  try { win.webContents.invalidate(); } catch (_) {}
  await sleep(400);
  const img = await win.webContents.capturePage();
  const name = THEME === 'light' ? 'instances-base-light.png' : 'instances-base.png';
  fs.writeFileSync(path.join(OUT, name), img.toPNG());

  /* 删除链路：数据过期 → 主进程返回 HAS_CHILDREN → 界面二次确认 → cascade */
  ST.stale = true;
  ST.forceHasChildren = true;
  ST.delCalls = [];
  await js('scanDir().then(() => true)');
  const deleted = await js(`deleteInstance('26.3').then(r => r === true)`);
  const calls = ST.delCalls.slice();
  console.log('DELETE ' + JSON.stringify({ deleted, calls }));

  app.exit(0);
});
