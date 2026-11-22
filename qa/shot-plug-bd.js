/* 基岩版插件面板截图（1.4.12：面板留在弹层里）
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/shot-plug-bd.js
 * 产物：qa/out/bd-plg-seedmap.png、bd-plg-server.png、bd-plg-gamepad.png、
 *       bd-plg-translator.png、bd-plg-small.png */
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
  { name: '海岛生存', levelName: '海岛生存', instance: '1.21.4-Fabric', path: 'D:/X/saves/海岛生存', lastPlayed: Date.now() - 86400e3 * 3 }
];

const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [
    { id: '1.21.4-Fabric', dir: '1.21.4-Fabric', hasJson: true, loader: 'Fabric' },
    { id: '26.3', dir: '26.3', hasJson: true, loader: 'Vanilla' }
  ], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3' }, versions: [
    { id: '26.3', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' }
  ] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888-8888', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: true, status: {} }),
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', latest: '0.4.2', outdated: false, running: false, port: 0 }),
  'update:check': () => ({ ok: true, current: '1.4.12', latest: '1.4.12', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves }),
  'mods:list': () => ({ ok: true, mods: [] }),
  'mods:dir': () => ({ ok: true, dir: 'D:\\X\\1.21.4-Fabric\\mods' }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:list': () => ({ ok: true, plugins: { seedmap: true, server: true, gamepad: true, translator: true },
    third: [{ id: 'xlcdemo', name: '示例社区插件', version: '0.3.1', author: '网友',
      description: '一个用来测卡片版式的社区插件（带独立面板）。',
      entry: 'panel.html', hasPage: true, pageTitle: '示例页', permissions: ['notify'], granted: ['notify'] }] }),
  'plugin:toggle': (_e, p) => ({ ok: true, plugins: {} }),
  'plugin:seedmap-platforms': () => ({ ok: true, platforms: [
    { code: 'java121', label: 'Java 1.21', group: 'Java 版' },
    { code: 'java118', label: 'Java 1.18', group: 'Java 版' },
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
  'translator:pick': () => ({ ok: true, canceled: false, path: 'D:\\X\\mods\\example.jar' }),
  'translator:inspect': () => ({ ok: true, info: { entries: 0, langs: [] } })
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
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('SHOT ' + name);
  };

  await js(`document.getElementById('bdGame').click()`);
  await sleep(900);
  await js(`document.querySelector('#bdSheet .bd-ptab[data-ptab="addon"]').click()`);
  await sleep(800);

  const openCard = async (i) => {
    await js(`document.querySelectorAll('#bdAddonList .bd-plg')[${i}].querySelector('[data-act="plugopen"]').click()`);
    await sleep(1000);
  };
  const back = async () => {
    await js(`document.querySelector('#bdSheet [data-act="plugback"]').click()`);
    await sleep(600);
  };

  await openCard(0); await shot('bd-plg-seedmap.png'); await back();
  await openCard(1); await shot('bd-plg-server.png'); await back();
  await openCard(2); await shot('bd-plg-gamepad.png'); await back();
  await openCard(3); await shot('bd-plg-translator.png');

  /* 小窗口：翻译器面板 1024×640 */
  win.setContentSize(1024, 640);
  await sleep(900);
  await shot('bd-plg-small.png');

  app.exit(0);
}).catch(e => {
  console.error('CRASH', e && e.stack || e);
  app.exit(2);
});
