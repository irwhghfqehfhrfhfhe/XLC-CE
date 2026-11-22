/* 「实例管理」入口连通性验证 + 截图
 * 背景：page-instances 之前没有任何入口（渲染出来了但没人能点到），这次补了三个入口：
 *   ① 侧边栏「实例管理」按钮  ② 主页「游戏版本 → 管理实例」  ③ 导入页「当前游戏目录 → 管理实例」
 * 用法：./node_modules/.bin/electron qa/shot-inst-entry.js
 * 产物：qa/out/entry-home.png、qa/out/entry-instances.png
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

const versions = [
  base('26.3', ['26.3-fabric-0.18.1']),
  { id: '26.3-fabric-0.18.1', folder: '26.3-fabric-0.18.1', loader: 'Fabric', type: 'release', inherits: true, hasJar: false, mcVersion: '26.3', children: [], isBase: false },
  base('26.4')
];

const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, p) => { Object.assign(baseCfg, p); return Object.assign({}, baseCfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ gameDir: baseCfg.gameDir, exists: true, broken: [], saves: [], versions }),
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
  'ui:trace': () => ({ ok: true })
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
  await sleep(300);

  const shot = async (name) => {
    try { win.webContents.invalidate(); } catch (_) {}
    await sleep(320);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
  };
  const state = () => js(`(() => JSON.stringify({
    active: (document.querySelector('.page.active') || {}).id || '',
    railOn: (document.querySelector('.rail-btn.active') || {}).dataset ? (document.querySelector('.rail-btn.active') || {}).dataset.page : '',
    hasRailBtn: !!document.querySelector('#railNav .rail-btn[data-page="instances"]')
  }))()`).then(JSON.parse);

  const results = [];
  const ok = (c, n, e) => results.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

  /* 初始：主页 */
  const s0 = await state();
  ok(s0.active === 'page-home', '初始在主页', s0.active);
  ok(s0.hasRailBtn, '侧边栏有「实例管理」按钮');
  await shot(THEME === 'light' ? 'entry-home-light.png' : 'entry-home.png');

  /* ① 侧边栏按钮 */
  await js(`document.querySelector('#railNav .rail-btn[data-page="instances"]').click()`);
  await sleep(600);
  const s1 = await state();
  ok(s1.active === 'page-instances', '点侧边栏按钮进入实例管理', s1.active);
  ok(s1.railOn === 'instances', '侧边栏按钮高亮同步', s1.railOn);
  ok(await js(`document.querySelectorAll('#instList .ver-row').length > 0`), '实例列表有内容');
  await shot(THEME === 'light' ? 'entry-instances-light.png' : 'entry-instances.png');

  /* 返回主页 */
  await js(`document.getElementById('btnInstBack').click()`);
  await sleep(400);
  ok((await state()).active === 'page-home', '「返回主页」可用');

  /* ② 主页「游戏版本 → 管理实例」 */
  await js(`document.getElementById('btnManageInst').click()`);
  await sleep(500);
  ok((await state()).active === 'page-instances', '主页「管理实例」文字入口可用');

  /* ③ 导入页「当前游戏目录 → 管理实例」 */
  await js(`gotoPage('import')`);
  await sleep(400);
  await js(`document.getElementById('btnInstManage2').click()`);
  await sleep(500);
  ok((await state()).active === 'page-instances', '导入页「管理实例」按钮可用');

  console.log(results.join('\n'));
  app.exit(results.every(r => !r.startsWith('FAIL')) ? 0 : 1);
});
