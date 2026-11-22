/* 基岩版「游戏」页截图（1.4.10 改版）
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/shot-play-bd.js
 * 产物：qa/out/bd-play-game.png、bd-play-addon.png、bd-play-empty.png、bd-play-small.png */
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
const saves = [
  { name: '新的世界', levelName: '新的世界', instance: '1.21.4-Fabric', path: 'D:/X/saves/新的世界', lastPlayed: Date.now() - 3600e3 },
  { name: '海岛生存', levelName: '海岛生存', instance: '1.21.4-Fabric', path: 'D:/X/saves/海岛生存', lastPlayed: Date.now() - 86400e3 * 3 },
  { name: '创造实验室', levelName: '创造实验室', instance: '26.3', path: 'D:/X/saves/创造实验室', lastPlayed: Date.now() - 86400e3 * 9 }
];
const mods = [
  { name: 'fabric-api-0.115.0+1.21.4.jar', disabled: false, size: 2.1e6 },
  { name: 'sodium-fabric-0.6.9.jar', disabled: false, size: 1.4e6 },
  { name: 'appleskin-fabric-2.5.1.jar', disabled: true, size: 46400 },
  { name: 'jei-1.21.4-fabric-19.21.0.247.jar', disabled: false, size: 1.9e6 }
];
let modState = mods.map(m => Object.assign({}, m));
let emptyMode = false;   /* true = 存档 / 插件都为空，拍空态用 */

const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [
    { id: '1.21.4-Fabric', dir: '1.21.4-Fabric', hasJson: true, loader: 'Fabric' },
    { id: '26.3', dir: '26.3', hasJson: true, loader: 'Vanilla' }
  ], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4' }, versions: [
    { id: '26.3', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' },
    { id: '1.21.4', type: 'release', releaseTime: '2025-12-05T10:00:00+00:00' }
  ] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888-8888', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: true, status: {} }),
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'friends:signal-send': () => ({ ok: true }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', latest: '0.4.2', outdated: false, running: false, port: 0 }),
  'update:check': () => ({ ok: true, current: '1.4.12', latest: '1.4.12', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: emptyMode ? [] : saves }),
  'mods:list': () => ({ ok: true, mods: emptyMode ? [] : modState }),
  'mods:dir': () => ({ ok: true, dir: 'D:\\X\\1.21.4-Fabric\\mods' }),
  'mods:toggle': (_e, p) => {
    const m = modState.find(x => x.name === p.name);
    if (m) m.disabled = !m.disabled;
    return { ok: true, now: m ? m.name : '' };
  },
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:toggle': (_e, p) => ({ ok: true, plugins: Object.assign({}, { seedmap: true, server: true, gamepad: true, translator: true, xlcdemo: true }, { [p.id]: !!p.enabled }) }),
  'plugin:list': () => ({ ok: true, plugins: { seedmap: true, server: true, gamepad: true, translator: true, xlcdemo: true },
    third: [{ id: 'xlcdemo', name: '示例社区插件', version: '0.3.1', author: '网友',
      description: '一个用来测卡片版式的社区插件（带独立面板）。',
      entry: 'panel.html', hasPage: true, pageTitle: '示例页', permissions: ['notify'], granted: ['notify'] }] })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false, frame: false, width: 1280, height: 880, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true }
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(3200);
  const js = (code) => win.webContents.executeJavaScript(code, true);
  await js(`(() => {
    if (document.getElementById('qaNoAnim')) return true;
    const st = document.createElement('style');
    st.id = 'qaNoAnim';
    st.textContent = '*,*::before,*::after{animation:none !important;transition:none !important}';
    document.head.appendChild(st);
    return true;
  })()`);

  const shot = async (name) => {
    try { win.webContents.invalidate(); } catch (_) {}
    await sleep(500);
    fs.writeFileSync(path.join(OUT, name), (await win.webContents.capturePage()).toPNG());
    console.log('saved qa/out/' + name);
  };

  await js(`document.getElementById('bdGame').click()`);
  await sleep(1100);
  console.log('PLAY ' + await js(`(() => {
    const s = document.getElementById('bdSheet');
    const slot = document.getElementById('bdGameSlot');
    const b = document.getElementById('bdPlay');
    return JSON.stringify({
      cls: s.className, full: document.getElementById('bdRoot').classList.contains('bd-full'),
      ttl: (document.querySelector('#bdSheet .bd-ttl') || {}).textContent,
      soc: (document.getElementById('bdPlaySocN') || {}).textContent,
      tabs: Array.from(document.querySelectorAll('#bdSheet .bd-ptab')).map(t => t.textContent.trim()),
      active: (document.querySelector('#bdSheet .bd-ptab.on') || {}).textContent,
      tx: (document.getElementById('bdPlayTx') || {}).textContent,
      label: (document.querySelector('.bd-play-vlb') || {}).textContent,
      ver: (document.getElementById('bdGameVer') || {}).value,
      inSlot: !!(slot && slot.querySelector('#bdPlay')),
      btnW: b ? Math.round(b.getBoundingClientRect().width) : 0,
      btnH: b ? Math.round(b.getBoundingClientRect().height) : 0,
      worlds: document.querySelectorAll('#bdWorlds .bd-world').length
    });
  })()`));
  console.log('TABS ' + await js(`(() => {
    const on = document.querySelector('#bdSheet .bd-ptab.on');
    const off = document.querySelector('#bdSheet .bd-ptab:not(.on)');
    const cs = (el) => { const c = getComputedStyle(el); return { bg: c.backgroundImage.slice(0, 46), sh: c.boxShadow.slice(0, 60), col: c.color }; };
    return JSON.stringify({ on: cs(on), off: cs(off) });
  })()`));
  await shot('bd-play-game.png');

  await js(`document.querySelector('#bdSheet .bd-ptab[data-ptab="addon"]').click()`);
  await sleep(800);
  console.log('PLUGIN ' + await js(`(() => JSON.stringify({
    on: (document.querySelector('#bdSheet .bd-ptab.on') || {}).textContent,
    cards: document.querySelectorAll('#bdAddonList .bd-plg').length,
    dirs: document.querySelectorAll('#bdAddonList [data-act="plugdir"]').length,
    stat: (document.getElementById('bdPlugStat') || {}).textContent,
    verHidden: document.getElementById('bdPlayVer').hidden,
    playHide: document.getElementById('bdGameSlot').hidden
  }))()`));
  await shot('bd-play-addon.png');

  /* 停用一个 → 卡片变灰 */
  await js(`document.querySelector('#bdAddonList .bd-plg .bd-sw').click()`);
  await sleep(700);
  console.log('TOGGLE ' + await js(`(() => JSON.stringify({
    off: document.querySelectorAll('#bdAddonList .bd-plg.off').length }))()`));
  await shot('bd-play-addon-off.png');
  await js(`document.querySelector('#bdAddonList .bd-plg .bd-sw').click()`);
  await sleep(400);

  /* 回游戏页：空态（存档空） */
  await js(`document.querySelector('#bdSheet .bd-ptab[data-ptab="game"]').click()`);
  await sleep(300);
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(400);
  emptyMode = true;
  await js(`document.getElementById('bdGame').click()`);
  await sleep(900);
  await shot('bd-play-empty.png');

  /* 主菜单（无标题栏）+ 退出启动器确认框 */
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(500);
  await shot('bd-home-full.png');
  await js(`document.getElementById('bdQuit').click()`);
  await sleep(700);
  await shot('bd-quit.png');
  await js(`document.querySelector('#bdSheet .bd-sheet-foot [data-close]').click()`);
  await sleep(400);

  /* 小窗口（1024×640）：插件页签 */
  emptyMode = false;
  win.setContentSize(1024, 640);
  await sleep(500);
  await js(`document.getElementById('bdGame').click()`);
  await sleep(900);
  await js(`document.querySelector('#bdSheet .bd-ptab[data-ptab="addon"]').click()`);
  await sleep(700);
  await shot('bd-play-small.png');
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(400);

  /* 从游戏页点右上角「社交」→ 关掉要回到游戏页 */
  await js(`document.getElementById('bdGame').click()`);
  await sleep(900);
  await js(`document.querySelector('#bdSheet .bd-play-soc').click()`);
  await sleep(700);
  const socOpen = await js(`(() => ({ side: document.getElementById('bdSheet').classList.contains('bd-side') }))()`);
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(700);
  const back = await js(`(() => ({ play: document.getElementById('bdSheet').classList.contains('bd-play'),
      on: document.getElementById('bdRoot').classList.contains('on') }))()`);
  console.log('SOCIETY ' + JSON.stringify({ socOpen, back }));

  app.exit(0);
});
