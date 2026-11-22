/* 1.4.14 主菜单三件套截图：黄色标语 / 实例角标 / 常驻下载进度 + 背景三档 + 存档卡小铅笔
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/shot-1414.js
 * 产物：qa/out/bd-home-1414.png、bd-dlbar-1414.png、bd-inst-1414.png、
 *       bd-game-1414.png、bd-rename-1414.png、bd-sky-dusk-1414.png、bd-sky-night-1414.png */
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
  appVersion: '1.4.14', autoCheckUpdate: false, seenVersion: '1.4.14',
  railPosition: 'left', theme: 'bedrock', accentColor: '', bgMode: 'default', activeAccount: 'Steve',
  uiSound: false, launcherVisibility: 'keep', forceChinese: true, startPage: 'bedrock', bdSky: 'auto'
};
const saves = [
  { name: '新的世界', levelName: '新的世界', instance: '1.21.4-Fabric', path: 'D:/X/versions/1.21.4-Fabric/saves/新的世界', lastPlayed: Date.now() - 3600e3 },
  { name: '海岛生存', levelName: '海岛生存', instance: '1.21.4-Fabric', path: 'D:/X/versions/1.21.4-Fabric/saves/海岛生存', lastPlayed: Date.now() - 86400e3 * 3 },
  { name: '创造实验室', levelName: '创造实验室', instance: '26.3', path: 'D:/X/versions/26.3/saves/创造实验室', lastPlayed: Date.now() - 86400e3 * 9 },
  { name: '空岛一百天', levelName: '空岛一百天', instance: '26.3', path: 'D:/X/versions/26.3/saves/空岛一百天', lastPlayed: Date.now() - 86400e3 * 14 },
  { name: '机械动力', levelName: '机械动力', instance: '1.20.1-Forge', path: 'D:/X/versions/1.20.1-Forge/saves/机械动力', lastPlayed: Date.now() - 86400e3 * 20 },
  { name: '和朋友联机', levelName: '和朋友联机', instance: '1.21.4-Fabric', path: 'D:/X/versions/1.21.4-Fabric/saves/和朋友联机', lastPlayed: Date.now() - 86400e3 * 26 }
];

const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [
    { id: '1.21.4-Fabric', dir: '1.21.4-Fabric', hasJson: true, loader: 'Fabric' },
    { id: '26.3', dir: '26.3', hasJson: true, loader: 'Vanilla' },
    { id: '1.20.1-Forge', dir: '1.20.1-Forge', hasJson: true, loader: 'Forge' }
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
  'update:check': () => ({ ok: true, current: '1.4.14', latest: '1.4.14', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves }),
  'saves:rename': (_e, p) => {
    const s = saves.find(x => x.path === p.path);
    if (s) { s.levelName = p.name; s.name = p.name; }
    return { ok: true, name: p.name };
  },
  'mods:list': () => ({ ok: true, mods: [] }),
  'mods:dir': () => ({ ok: true, dir: 'D:\\X\\1.21.4-Fabric\\mods' }),
  'plugin:list': () => ({ ok: true, plugins: { seedmap: true, server: true, gamepad: true, translator: true }, third: [] }),
  'plugin:toggle': () => ({ ok: true, plugins: { seedmap: true, server: true, gamepad: true, translator: true } })
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
    await sleep(450);
    fs.writeFileSync(path.join(OUT, name), (await win.webContents.capturePage()).toPNG());
    console.log('saved qa/out/' + name);
  };

  /* 主菜单：标语 + 实例角标（auto 背景按当前时间） */
  console.log('HOME ' + await js(`(() => {
    const sp = document.getElementById('bdSplash');
    const cs = getComputedStyle(sp);
    return JSON.stringify({
      splash: sp ? sp.textContent : '',
      splashColor: cs.color, splashAnim: cs.animationName, splashScale: cs.scale,
      inst: (document.getElementById('bdInstName') || {}).textContent,
      sky: window.BEDROCK.skyState(),
      bodyCls: document.body.className
    });
  })()`));
  await shot('bd-home-1414.png');

  /* 点标语换一句 */
  console.log('SPLASH ' + await js(`(() => {
    const sp = document.getElementById('bdSplash');
    const a = sp.textContent; sp.click(); const b = sp.textContent;
    return JSON.stringify({ a, b, changed: a !== b });
  })()`));

  /* 下载进度：从主进程真推一条安装进度 */
  win.webContents.send('install:progress', { stage: 'assets', percent: 62, text: '资源文件 1204/1940' });
  await sleep(600);
  console.log('DLBAR ' + await js(`(() => {
    const b = document.getElementById('bdDlBar');
    return JSON.stringify({
      hidden: b.hidden, cls: b.className,
      tx: (document.getElementById('bdDlBarTx') || {}).textContent,
      pct: (document.getElementById('bdDlBarPct') || {}).textContent,
      fill: (document.getElementById('bdDlBarFill') || {}).style.width,
      w: Math.round(b.getBoundingClientRect().width)
    });
  })()`));
  await shot('bd-dlbar-1414.png');

  /* 实例角标 → 版本列表 */
  await js(`document.getElementById('bdInst').click()`);
  await sleep(700);
  console.log('INST ' + await js(`(() => {
    const s = document.getElementById('bdSheet');
    return JSON.stringify({
      on: document.getElementById('bdRoot').classList.contains('on'),
      ttl: (document.querySelector('#bdSheet .bd-ttl') || {}).textContent,
      rows: document.querySelectorAll('#bdSheet .bd-vrow').length,
      cur: (document.querySelector('#bdSheet .bd-vrow.cur') || {}).textContent
    });
  })()`));
  await shot('bd-inst-1414.png');
  /* 点一行就地切版本：选中的版本要变、角标要跟着变、弹层要关 */
  await js(`document.querySelector('#bdSheet [data-pickver="26.3"]').click()`);
  await sleep(700);
  console.log('PICK ' + await js(`JSON.stringify({
    sel: (document.getElementById('selVersion') || {}).value,
    badge: (document.getElementById('bdInstName') || {}).textContent,
    sheetOn: document.getElementById('bdRoot').classList.contains('on')
  })`));
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(400);

  /* 游戏页：存档卡的小铅笔 */
  await js(`document.getElementById('bdGame').click()`);
  await sleep(1200);
  console.log('PENCIL ' + await js(`(() => {
    const ed = document.querySelector('#bdWorlds .bd-world-edit');
    const card = document.querySelector('#bdWorlds .bd-world');
    const r = ed ? ed.getBoundingClientRect() : null;
    return JSON.stringify({
      worlds: document.querySelectorAll('#bdWorlds .bd-world').length,
      pencils: document.querySelectorAll('#bdWorlds .bd-world-edit').length,
      tx: ed ? ed.textContent.trim() : '',
      name: ed ? ed.dataset.savename : '',
      w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
      cardH: card ? Math.round(card.getBoundingClientRect().height) : 0
    });
  })()`));
  await shot('bd-game-1414.png');

  /* 点铅笔 → 改名弹层 */
  await js(`document.querySelector('#bdWorlds .bd-world-edit').click()`);
  await sleep(700);
  console.log('RENAME ' + await js(`(() => {
    const inp = document.getElementById('bdRenameInp');
    return JSON.stringify({
      ttl: (document.querySelector('#bdSheet .bd-ttl') || {}).textContent,
      val: inp ? inp.value : '',
      focus: document.activeElement && document.activeElement.id,
      saveBtn: !!document.querySelector('#bdSheet [data-act="saverename"]')
    });
  })()`));
  await shot('bd-rename-1414.png');
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(400);
  /* 关掉游戏页那张满屏面板，不然背景三档拍到的都是面板 */
  if (await js(`document.getElementById('bdRoot').classList.contains('on')`)) {
    await js(`document.querySelector('#bdSheet [data-close]').click()`);
    await sleep(500);
  }

  /* 背景三档 */
  await js(`S.config.bdSky = 'dusk'; window.BEDROCK.sky()`);
  await sleep(500);
  console.log('SKY-DUSK ' + await js(`JSON.stringify({ cls: document.body.className, filter: getComputedStyle(document.querySelector('#page-bedrock .bd-pano-strip')).filter })`));
  await shot('bd-sky-dusk-1414.png');

  await js(`S.config.bdSky = 'night'; window.BEDROCK.sky()`);
  await sleep(500);
  console.log('SKY-NIGHT ' + await js(`JSON.stringify({ cls: document.body.className, filter: getComputedStyle(document.querySelector('#page-bedrock .bd-pano-strip')).filter })`));
  await shot('bd-sky-night-1414.png');

  /* 1024 宽：标语会不会怼到 3D 角色上 */
  win.setContentSize(1024, 640);
  await sleep(600);
  console.log('SMALL ' + await js(`(() => {
    const sp = document.getElementById('bdSplash').getBoundingClientRect();
    const lg = document.getElementById('bdLogo').getBoundingClientRect();
    const md = document.getElementById('bdModel').getBoundingClientRect();
    const r = (o) => ({ l: Math.round(o.left), r: Math.round(o.right), t: Math.round(o.top), b: Math.round(o.bottom) });
    return JSON.stringify({ splash: r(sp), logo: r(lg), model: r(md),
      overlapLogo: sp.left < lg.right - 4,
      overlapModel: sp.right > md.left && sp.top < md.bottom });
  })()`));
  await shot('bd-home-small-1414.png');

  app.exit(0);
});
