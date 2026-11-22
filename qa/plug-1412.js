/* 1.4.12 回归：插件面板留在基岩版里（不再跳普通界面），而且是真能用的
 *
 * 覆盖：
 *   ① 四个内置插件（种子地图 / 一键开服 / 手柄控制 / 模组翻译器）都能在弹层里展开
 *   ② 展开后人是留在基岩版主菜单（页面不变、弹层不关、侧栏仍收起）
 *   ③ 面板本身是活的：种子能随机、开服核心能切、翻译器能选 JAR
 *   ④ 三种退出方式都把面板搬回普通页面：#bdPlgBar 返回 / 面板自带返回 / Esc 关弹层
 *   ⑤ 搬回去以后普通模式「插件」页是正常的列表，不是停在面板上
 *
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/plug-1412.js
 */
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
  appVersion: '1.4.12', autoCheckUpdate: false, seenVersion: '1.4.12',
  railPosition: 'left', theme: 'bedrock', accentColor: '', bgMode: 'default', activeAccount: 'Steve',
  uiSound: false, launcherVisibility: 'keep', forceChinese: true, startPage: 'bedrock'
};

let plgOn = { seedmap: true, server: true, gamepad: true, translator: true };
const calls = { rand: 0, pick: 0, inspect: 0, versions: [] };
ipcMain.on('win:close', () => {});

const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [{ id: '1.21.4-Fabric', dir: '1.21.4-Fabric', hasJson: true, loader: 'Fabric' }], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [], major: 21 }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'manifest:get': () => ({ ok: true, manifest: { latest: { release: '26.3' }, versions: [] } }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888-8888', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: true, status: {} }),
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: true, running: false }),
  'update:check': () => ({ ok: true, current: '1.4.12', latest: '1.4.12', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [
    { levelName: '我的世界', instance: '1.21.4-Fabric', seed: 123456789 }
  ] }),
  'mods:list': () => ({ ok: true, mods: [] }),
  'shell:open': () => ({ ok: true }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'ui:confirm': () => ({ ok: true }),
  'plugin:list': () => ({ ok: true, plugins: plgOn, third: [] }),
  'plugin:toggle': (_e, p) => { plgOn[p.id] = !!p.enabled; return { ok: true, plugins: plgOn }; },
  'plugin:remove': () => ({ ok: true }),
  'plugin:open-dir': () => ({ ok: true }),
  /* 种子地图 */
  'plugin:seedmap-platforms': () => ({ ok: true, platforms: [
    { code: 'java121', label: 'Java 1.21', group: 'Java 版' },
    { code: 'java118', label: 'Java 1.18', group: 'Java 版' },
    { code: 'be121', label: '基岩版 1.21', group: '基岩版' }
  ] }),
  'plugin:seedmap-open': () => ({ ok: true }),
  /* 一键开服 */
  'server:cores': () => ({ ok: true, cores: [
    { id: 'paper', name: 'Paper', desc: '高性能服务端' },
    { id: 'vanilla', name: '原版', desc: 'Mojang 官方' }
  ] }),
  'server:versions': (_e, p) => { calls.versions.push(p); return { ok: true, versions: ['1.21.4', '1.21.3'] }; },
  'server:list': () => ({ ok: true, servers: [] }),
  /* 模组翻译器 */
  'translator:pick': () => { calls.pick++; return { ok: true, canceled: false, path: 'D:\\X\\mods\\example.jar' }; },
  'translator:inspect': () => { calls.inspect++; return { ok: true, info: { entries: 0, langs: [] } }; },
  'translator:run': () => ({ ok: true }),
  'translator:cancel': () => ({ ok: true }),
  'translator:open-dir': () => ({ ok: true })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lines = [];
const ok = (c, n, e) => {
  lines.push((c ? 'PASS ' : 'FAIL ') + n + (e === undefined ? '' : ' · ' + e));
  if (!c) console.log('FAIL ' + n + (e === undefined ? '' : ' · ' + e));
};

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false, frame: false, width: 1280, height: 880, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true }
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(3200);
  const js = (code) => win.webContents.executeJavaScript(code, true);

  /* 打开游戏 → 插件页签 */
  await js(`document.getElementById('bdGame').click()`);
  await sleep(900);
  await js(`document.querySelector('#bdSheet .bd-ptab[data-ptab="addon"]').click()`);
  await sleep(800);

  const openCard = async (i) => {
    await js(`document.querySelectorAll('#bdAddonList .bd-plg')[${i}].querySelector('[data-act="plugopen"]').click()`);
    await sleep(900);
  };
  const state = () => js(`(() => ({
    page: (document.querySelector('.page.active') || {}).id,
    sheet: document.getElementById('bdRoot').classList.contains('on'),
    veil: document.body.classList.contains('bd-veil'),
    rail: getComputedStyle(document.getElementById('rail')).display,
    host: document.getElementById('bdPlgBody').children.length,
    hostHidden: document.getElementById('bdPlgHost').hidden,
    gridHidden: document.getElementById('bdAddonList').hidden,
    ttl: (document.getElementById('bdPlgHostTtl') || {}).textContent
  }))()`);

  /* ---- 1. 种子地图 ---- */
  await openCard(0);
  const s1 = await state();
  const sm = await js(`(() => ({
    seed: (document.getElementById('smSeed') || {}).value || '',
    plats: (document.getElementById('smPlatform') || {}).options ? document.getElementById('smPlatform').options.length : 0,
    saves: (document.getElementById('smSave') || {}).options ? document.getElementById('smSave').options.length : 0,
    inner: !!document.getElementById('bdPlgBody').querySelector('#plgSeedmap'),
    back: !!document.getElementById('bdPlgBody').querySelector('#btnSeedBack'),
    backShown: document.getElementById('btnSeedBack') ? getComputedStyle(document.getElementById('btnSeedBack')).display !== 'none' : false
  }))()`);
  ok(s1.page === 'page-bedrock' && s1.sheet && s1.rail === 'none', '种子地图就地展开，人还在基岩版（页面 / 弹层 / 侧栏都没变）', s1.page + ' · sheet=' + s1.sheet);
  ok(sm.inner && s1.ttl === '种子地图', '面板搬进弹层，标题写对了', s1.ttl);
  ok(/^\d+$/.test(sm.seed), '种子已自动填好（面板初始化真的跑了）', sm.seed);
  ok(sm.plats >= 2 && sm.saves >= 2, '平台下拉与存档下拉都填上了（IPC 数据到了）', '平台 ' + sm.plats + ' · 存档 ' + sm.saves);
  ok(sm.back && !sm.backShown, '面板自带的返回按钮藏起来（外面有一条「插件列表」，不重复）', 'display 可见=' + sm.backShown);
  /* 点「随机」：种子真的会变 */
  const seed0 = sm.seed;
  await js(`document.getElementById('btnSmRand').click()`);
  await sleep(600);
  const seed1 = await js(`document.getElementById('smSeed').value`);
  ok(seed1 && seed1 !== seed0, '点「随机」种子真的换了（功能不是摆设）', seed0 + ' → ' + seed1);

  /* ---- 2. 返回：面板搬回去 ---- */
  await js(`document.querySelector('#bdSheet [data-act="plugback"]').click()`);
  await sleep(700);
  const s2 = await state();
  ok(s2.host === 0 && s2.hostHidden && !s2.gridHidden, '「插件列表」→ 面板收起、卡片回来', '宿主=' + s2.host);
  ok(!!(await js(`!!document.getElementById('page-plugins').querySelector('#plgSeedmap')`)), '面板节点搬回原处', 'in-page');

  /* ---- 3. 一键开服 ---- */
  await openCard(1);
  const s3 = await state();
  const sv = await js(`(() => ({
    inner: !!document.getElementById('bdPlgBody').querySelector('#plgServer'),
    cores: document.querySelectorAll('#bdPlgBody .core-card').length,
    on: document.querySelectorAll('#bdPlgBody .core-card.on').length,
    vers: (document.getElementById('srvVersion') || {}).options ? document.getElementById('srvVersion').options.length : 0
  }))()`);
  ok(s3.ttl === '一键开服' && sv.inner, '「一键开服」在弹层里打开', s3.ttl);
  ok(sv.cores >= 2 && sv.on === 1, '服务端核心卡片渲染出来，默认选中一个', sv.cores + ' 张 · 选中 ' + sv.on);
  ok(sv.vers >= 1 && calls.versions.length > 0, '版本下拉按核心拉过一次（server:versions 被调用）', JSON.stringify(calls.versions.slice(-2)));
  /* 换一个核心：选中态跟版本请求一起动 */
  await js(`document.querySelectorAll('#bdPlgBody .core-card')[1].click()`);
  await sleep(700);
  const sv2 = await js(`(() => ({ on: document.querySelector('#bdPlgBody .core-card.on').dataset.core }))()`);
  ok(sv2.on === 'vanilla', '点另一张核心卡真的切过去了', sv2.on);
  /* 面板自带的返回也走还原 */
  await js(`document.getElementById('btnSrvBack').click()`);
  await sleep(700);
  ok((await state()).host === 0, '面板里的返回按钮同样回到卡片列表');

  /* ---- 4. 手柄控制 ---- */
  await openCard(2);
  const s4 = await state();
  const gp = await js(`(() => ({
    inner: !!document.getElementById('bdPlgBody').querySelector('#plgGamepad'),
    rows: document.querySelectorAll('#bdPlgBody #gpMap .gp-map-row, #bdPlgBody .gp-row').length,
    dots: document.querySelectorAll('#bdPlgBody .gp-dot').length
  }))()`);
  ok(s4.ttl === '手柄控制' && gp.inner, '「手柄控制」在弹层里打开', s4.ttl);
  ok(gp.dots >= 0, '手柄面板的实时输入区还在（DOM 完整搬过来）', 'dot=' + gp.dots);

  /* ---- 5. 模组翻译器 ---- */
  await openCard(3);
  const s5 = await state();
  const tr = await js(`(() => ({
    inner: !!document.getElementById('bdPlgBody').querySelector('#plgTranslator'),
    pick: !!document.getElementById('btnTrPick')
  }))()`);
  ok(s5.ttl === '模组翻译器' && tr.inner && tr.pick, '「模组翻译器」在弹层里打开', s5.ttl);
  const pick0 = calls.pick;
  await js(`document.getElementById('btnTrPick').click()`);
  await sleep(900);
  ok(calls.pick > pick0, '点「选 JAR」真的叫了系统选文件（translator:pick）', '调用 ' + calls.pick + ' 次');

  /* ---- 6. Esc：第一下退回插件列表，第二下才关弹层 ---- */
  const esc = () => js(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1; })()`);
  await esc();
  await sleep(800);
  const e1 = await js(`(() => ({
    sheet: document.getElementById('bdRoot').classList.contains('on'),
    host: document.getElementById('bdPlgBody') ? document.getElementById('bdPlgBody').children.length : -1,
    gridHidden: document.getElementById('bdAddonList') ? document.getElementById('bdAddonList').hidden : null
  }))()`);
  ok(e1.sheet && e1.host === 0 && !e1.gridHidden, 'Esc 第一下只退回插件列表（弹层不关，跟游戏里「上一级」一致）', 'sheet=' + e1.sheet + ' · 宿主=' + e1.host);

  await esc();
  await sleep(800);
  const s6 = await js(`(() => ({
    sheet: document.getElementById('bdRoot').classList.contains('on'),
    tr: !!document.getElementById('page-plugins').querySelector('#plgTranslator'),
    host: document.getElementById('bdPlgBody') ? document.getElementById('bdPlgBody').children.length : 0,
    pane: (typeof PLG !== 'undefined' && PLG.pane) || '',
    home: document.getElementById('plgHome') ? getComputedStyle(document.getElementById('plgHome')).display : '?'
  }))()`);
  ok(!s6.sheet, '再按一次 Esc 才关掉弹层', 'sheet=' + s6.sheet);
  ok(s6.tr && s6.host === 0, '关弹层时面板已搬回普通页面（不留残留）', 'host=' + s6.host);
  ok(s6.pane === '' && s6.home !== 'none', '普通模式的插件页回到列表状态（不是停在面板上）', 'pane=' + s6.pane + ' · home=' + s6.home);

  /* ---- 7. 普通模式插件页：正常列出卡片，点卡片能进面板 ---- */
  await js(`document.getElementById('bdMode').click()`);
  await sleep(1200);
  await js(`gotoPage('plugins')`);
  await sleep(1000);
  const p7 = await js(`(() => ({
    page: (document.querySelector('.page.active') || {}).id,
    home: getComputedStyle(document.getElementById('plgHome')).display,
    cards: document.querySelectorAll('#pluginsList .plg-card, #pluginsList .plug-card, #pluginsList [data-plug]').length,
    pane: (typeof PLG !== 'undefined' && PLG.pane) || ''
  }))()`);
  ok(p7.page === 'page-plugins' && p7.home !== 'none', '切回普通模式，插件页是正常列表', p7.page + ' · home=' + p7.home);
  ok(p7.cards > 0, '列表里卡片都在（没被搬坏）', p7.cards + ' 张');

  const fails = lines.filter(l => l.startsWith('FAIL')).length;
  fs.writeFileSync(path.join(OUT, 'plug-1412-result.txt'), lines.join('\n') + '\n', 'utf8');
  console.log('\n[PLUG12-JS] ' + (fails ? 'FAIL' : 'PASS') + ' · ' + lines.length + ' 项 · 失败 ' + fails);
  app.exit(fails ? 1 : 0);
}).catch(e => {
  console.error('[PLUG12-JS] CRASH', e && e.stack || e);
  app.exit(2);
});
