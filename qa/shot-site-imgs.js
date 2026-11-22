/* 官网配图脚本 —— 拍一套 1.4.12 的干净展示图
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/shot-site-imgs.js
 * 产物：../website/assets/site-*.jpg（1440 宽，JPEG 88）
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '..', 'website', 'assets');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const cfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\Minecraft',
  appVersion: '1.4.15', autoCheckUpdate: false, seenVersion: '1.4.15',
  railPosition: 'left', theme: 'bedrock', accentColor: '', bgMode: 'default', activeAccount: 'Steve',
  javaPath: 'C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe',
  uiSound: false, launcherVisibility: 'keep', forceChinese: true, startPage: 'bedrock'
};

const saves = [
  { name: '海岛生存', levelName: '海岛生存', instance: '1.21.4-Fabric', path: 'D:/Minecraft/saves/海岛生存', lastPlayed: Date.now() - 3600e3 },
  { name: '创造实验室', levelName: '创造实验室', instance: '1.21.4-Fabric', path: 'D:/Minecraft/saves/创造实验室', lastPlayed: Date.now() - 86400e3 * 2 },
  { name: '原版空岛', levelName: '原版空岛', instance: '26.3', path: 'D:/Minecraft/saves/原版空岛', lastPlayed: Date.now() - 86400e3 * 6 },
  { name: '暮色森林', levelName: '暮色森林', instance: '1.21.4-Fabric', path: 'D:/Minecraft/saves/暮色森林', lastPlayed: Date.now() - 86400e3 * 12 },
  { name: '红石工厂', levelName: '红石工厂', instance: '1.21.4-Forge', path: 'D:/Minecraft/saves/红石工厂', lastPlayed: Date.now() - 86400e3 * 21 },
  { name: '天空岛 1.16', levelName: '天空岛 1.16', instance: '1.16.5', path: 'D:/Minecraft/saves/天空岛 1.16', lastPlayed: Date.now() - 86400e3 * 40 }
];

const mods = [
  { name: 'fabric-api-0.115.0+1.21.4.jar', disabled: false, size: 2.1e6 },
  { name: 'sodium-fabric-0.6.9.jar', disabled: false, size: 1.4e6 },
  { name: 'iris-fabric-1.8.8.jar', disabled: false, size: 9.2e6 },
  { name: 'appleskin-fabric-2.5.1.jar', disabled: true, size: 46400 },
  { name: 'jei-1.21.4-fabric-19.21.0.247.jar', disabled: false, size: 1.9e6 }
];

const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [
    { id: '1.21.4-Fabric', dir: '1.21.4-Fabric', hasJson: true, loader: 'Fabric' },
    { id: '1.21.4-Forge', dir: '1.21.4-Forge', hasJson: true, loader: 'Forge' },
    { id: '1.20.1-原版生存', dir: '1.20.1-原版生存', hasJson: true, loader: 'Vanilla' },
    { id: '26.3', dir: '26.3', hasJson: true, loader: 'Vanilla', isBase: true, children: ['1.21.4-Fabric', '1.21.4-Forge'] }
  ], broken: [
    { folder: '1.21.5-Forge-残', hasJson: false, reason: '缺少 1.21.5-Forge-残.json' }
  ] }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'java:list': () => ({ ok: true, javas: [
    { path: 'C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe', major: 21, ver: '21.0.5' },
    { path: 'C:\\Program Files\\Java\\jdk-17\\bin\\javaw.exe', major: 17, ver: '17.0.13' },
    { path: 'D:\\Minecraft\\runtime\\java-8\\bin\\javaw.exe', major: 8, ver: '1.8.0_431' }
  ] }),
  'java:open-runtime': () => ({ ok: true, dir: 'D:\\Minecraft\\runtime' }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: {
    latest: { release: '26.3', snapshot: '26.4' },
    versions: [
      { id: '26.4', type: 'snapshot', releaseTime: '2026-11-12T10:00:00+00:00' },
      { id: '26.3', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' },
      { id: '1.21.4', type: 'release', releaseTime: '2025-12-05T10:00:00+00:00' },
      { id: '1.20.4', type: 'release', releaseTime: '2023-12-07T10:00:00+00:00' },
      { id: '1.16.5', type: 'release', releaseTime: '2021-01-14T10:00:00+00:00' },
      { id: '1.12.2', type: 'release', releaseTime: '2017-09-18T10:00:00+00:00' }
    ] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'XLC-8842-1735', friends: [
    { name: 'Alex', online: true, lastSeen: Date.now() },
    { name: 'Notch', online: false, lastSeen: Date.now() - 3600e3 * 5 },
    { name: 'Herobrine', online: true, lastSeen: Date.now() }
  ] }),
  'friends:presence': () => ({ ok: true, connected: true, status: { Alex: { online: true, game: '1.21.4' }, Herobrine: { online: true } } }),
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'friends:signal-send': () => ({ ok: true }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', latest: '0.4.2', outdated: false, running: true, port: 25565, room: 'XLC-8842-1735' }),
  'mp:start': () => ({ ok: true, port: 25565, room: 'XLC-8842-1735' }),
  'mp:stop': () => ({ ok: true }),
  'update:check': () => ({ ok: true, current: '1.4.15', latest: '1.4.15', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [
    { name: 'Steve', type: 'offline', model: 'classic' },
    { name: 'Alex', type: 'microsoft', model: 'slim' }
  ], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves }),
  'mods:list': () => ({ ok: true, mods }),
  'mods:dir': () => ({ ok: true, dir: 'D:\\Minecraft\\1.21.4-Fabric\\mods' }),
  'mods:toggle': () => ({ ok: true }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:list': () => ({ ok: true,
    plugins: { seedmap: true, server: true, gamepad: true, translator: true },
    third: [] }),
  'plugin:toggle': (_e, p) => ({ ok: true, plugins: { seedmap: true, server: true, gamepad: true, translator: true, [p.id]: !!p.enabled } }),
  'skin:get': () => ({ ok: false }),
  'dir:open': () => ({ ok: true }),
  'mp:state': () => ({ ok: true, state: 'idle', room: '', port: 0 }),
  'plugin:seedmap-platforms': () => ({ ok: true, platforms: [
    { code: 'java121', label: 'Java 1.21', group: 'Java 版' },
    { code: 'java118', label: 'Java 1.18', group: 'Java 版' },
    { code: 'java116', label: 'Java 1.16', group: 'Java 版' },
    { code: 'be121', label: '基岩版 1.21', group: '基岩版' }
  ] }),
  'plugin:seedmap-open': () => ({ ok: true }),
  'server:cores': () => ({ ok: true, cores: [
    { id: 'paper', name: 'Paper', desc: '高性能服务端，支持 Bukkit/Spigot 插件（推荐）' },
    { id: 'purpur', name: 'Purpur', desc: 'Paper 分支，可玩性设置更多' },
    { id: 'vanilla', name: '原版', desc: 'Mojang 官方服务端，纯净无插件' },
    { id: 'fabric', name: 'Fabric', desc: '轻量模组服务端，支持 Fabric 模组' }
  ] }),
  'server:versions': () => ({ ok: true, versions: ['1.21.4', '1.21.3', '1.21.1', '1.20.6'] }),
  'server:list': () => ({ ok: true, servers: [] }),
  'translator:pick': () => ({ ok: true, canceled: true }),
  'translator:inspect': () => ({ ok: true, info: { entries: 0, langs: [] } })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: true, frame: false, width: 1600, height: 1000, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false }
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(3600);
  const js = (code) => win.webContents.executeJavaScript(code, true);

  /* 关动画 + 清掉启动提示 toast，让画面干净 */
  await js(`(() => {
    const st = document.createElement('style');
    st.id = 'qaNoAnim';
    st.textContent = '*,*::before,*::after{animation:none !important;transition:none !important} .gp-hover{outline:0 !important}';
    document.head.appendChild(st);
    const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    return true;
  })()`);

  const clean = () => js(`(() => {
    const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    if (document.activeElement) { try { document.activeElement.blur(); } catch (_) {} }
    /* 手柄插件的鼠标焦点环会框住正好在光标下的按钮，拍照时去掉 */
    document.querySelectorAll('.gp-hover').forEach(el => el.classList.remove('gp-hover'));
    return 1;
  })()`);

  const shot = async (name) => {
    try { win.webContents.invalidate(); } catch (_) {}
    await clean();
    await sleep(700);
    await clean();
    await sleep(250);
    const img = await win.webContents.capturePage();
    const out = img.resize({ width: 1440 });
    fs.writeFileSync(path.join(OUT, name), out.toJPEG(88));
    console.log('saved assets/' + name);
  };

  /* 1. 主菜单 */
  await shot('site-bd-menu.jpg');

  /* 2. 游戏页 */
  await js(`document.getElementById('bdGame').click()`);
  await sleep(1200);
  await shot('site-bd-game.jpg');

  /* 3. 插件页签 */
  await js(`document.querySelector('#bdSheet .bd-ptab[data-ptab="addon"]').click()`);
  await sleep(900);
  await shot('site-bd-addon.jpg');

  /* 4. 插件面板（第一张卡 = 种子地图） */
  const opened = await js(`(() => {
    const card = document.querySelector('#bdAddonList .bd-plg');
    const btn = card && card.querySelector('[data-act="plugopen"]');
    if (btn) { btn.click(); return btn.textContent.trim(); }
    return 'NO-BTN:' + (card ? card.innerHTML.slice(0, 200) : 'no-card');
  })()`);
  console.log('panel open:', opened);
  await sleep(1600);
  await shot('site-bd-panel.jpg');

  /* 5. 实例页签（1.4.15 新增：原来「管理实例」跳普通页，现在就地管） */
  const back = await js(`(() => { const b = document.querySelector('.bd-plg-bar [data-act="plugback"]'); if (b) { b.click(); return 'back'; } return 'none'; })()`);
  console.log('panel back:', back);
  await sleep(700);
  await js(`document.querySelector('#bdSheet .bd-ptab[data-ptab="inst"]').click()`);
  await sleep(1200);
  await shot('site-bd-inst.jpg');

  /* 6. 设置页（先回游戏页签再关弹层） */
  await js(`document.querySelector('#bdSheet .bd-ptab[data-ptab="game"]').click()`);
  await sleep(500);
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(700);
  await js(`document.getElementById('bdSettings').click()`);
  await sleep(1600);
  /* 停在「界面」分组：主题、窗口、控件大小与位置都在这页，比「通用」三行更能说明问题 */
  await js(`(() => { const b = document.querySelector('#bdSheet .bd-set-nav [data-tab="look"]'); if (b) { b.click(); return 1; } return 0; })()`);
  await sleep(1200);
  await shot('site-bd-set.jpg');

  /* 7. 联机 */
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(700);
  await js(`document.getElementById('bdLan').click()`);
  await sleep(1500);
  await shot('site-bd-lan.jpg');

  /* 8. 切换账户 */
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(700);
  await js(`document.getElementById('bdAccount').click()`);
  /* 满屏面板 + 右侧 3D 人物要一起画出来，等它真的挂上再拍 */
  for (let i = 0; i < 20; i++) {
    const ok = await js(`(() => { const s = document.getElementById('bdSheet'); return !!s && /切换账户/.test(s.textContent) && s.classList.contains('bd-set'); })()`);
    if (ok) break;
    await sleep(200);
  }
  await sleep(1800);
  /* 顺手点一下 Alex 那一行：右边的小人换成细手臂模型，比默认 Steve 好看 */
  await js(`(() => { const r = document.querySelector('#bdSheet [data-view="Alex"]'); if (r) { r.click(); return 1; } return 0; })()`);
  await sleep(1200);
  await shot('site-bd-acc.jpg');

  /* 9. 基岩版下载页 */
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(700);
  await js(`(typeof gotoPage === 'function') ? gotoPage('bedrock-dl') : document.getElementById('bdDlBack').click()`);
  await sleep(1800);
  await shot('site-bd-dl.jpg');

  /* 9.5 下载页 · Java（1.4.14 新增：基岩版自己的 Java 页，不跳普通设置页） */
  await js(`(() => { const b = document.querySelector('#bdDlTabs [data-cat="java"]'); if (b) { b.click(); return 1; } return 0; })()`);
  await sleep(1500);
  await shot('site-bd-java.jpg');

  /* 10. 普通模式（深色原生界面）：切回去拍一张做对照 */
  await js(`document.getElementById('bdMode').click()`);
  await sleep(2600);
  await shot('site-dark-home.jpg');

  app.exit(0);
});
