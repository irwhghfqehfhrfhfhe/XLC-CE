/* 基岩版「游戏」页回归（1.4.10 改版）
 * 对照游戏里的「选世界」界面：灰条顶栏（返回 · 游戏 · 社交）· 游戏/插件 两个通栏页签 ·
 * 左侧「切换版本」+ 右侧绿色「启动游戏」· 半透明石块面板 + 空态像素画。
 *
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/play-1410.js
 * 结果：qa/out/play-1410-result.txt（stdout 里也有 [PLAY-JS] PASS/FAIL 汇总行）
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
  appVersion: '1.4.11', autoCheckUpdate: false, seenVersion: '1.4.11',
  railPosition: 'left', theme: 'bedrock', accentColor: '', bgMode: 'default', activeAccount: 'Steve',
  uiSound: false, launcherVisibility: 'keep', forceChinese: true, startPage: 'bedrock'
};
let emptyMode = false;
const savesFull = [
  { name: '新的世界', levelName: '新的世界', instance: '1.21.4-Fabric', path: 'D:/X/saves/新的世界', lastPlayed: Date.now() - 3600e3 },
  { name: '海岛生存', levelName: '海岛生存', instance: '1.21.4-Fabric', path: 'D:/X/saves/海岛生存', lastPlayed: Date.now() - 86400e3 * 3 },
  { name: '创造实验室', levelName: '创造实验室', instance: '26.3', path: 'D:/X/saves/创造实验室', lastPlayed: Date.now() - 86400e3 * 9 }
];
let plgOn = { seedmap: true, server: true, gamepad: true, translator: true, xlcdemo: true };
let third = [{
  id: 'xlcdemo', name: '示例社区插件', version: '0.3.1', author: '网友',
  description: '一个用来测卡片版式的社区插件（有独立面板）。',
  entry: 'panel.html', hasPage: true, pageTitle: '示例页', permissions: ['notify'], granted: ['notify']
}];
let modState = [
  { name: 'fabric-api-0.115.0+1.21.4.jar', disabled: false, size: 2.1e6 },
  { name: 'sodium-fabric-0.6.9.jar', disabled: false, size: 1.4e6 },
  { name: 'appleskin-fabric-2.5.1.jar', disabled: true, size: 46400 },
  { name: 'jei-1.21.4-fabric-19.21.0.247.jar', disabled: false, size: 1.9e6 }
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
  'update:check': () => ({ ok: true, current: '1.4.11', latest: '1.4.11', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: emptyMode ? [] : savesFull }),
  'mods:list': () => ({ ok: true, mods: emptyMode ? [] : modState }),
  'mods:dir': () => ({ ok: true, dir: 'D:\\X\\1.21.4-Fabric\\mods' }),
  'mods:toggle': (_e, p) => {
    const m = modState.find(x => x.name === p.name);
    if (!m) return { ok: false, error: 'no such mod' };
    m.disabled = !m.disabled;
    return { ok: true, now: m.name + (m.disabled ? '.disabled' : '') };
  },
  'shell:open': () => ({ ok: true }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  /* 启动器插件（不是游戏 mods）：内置 4 个 + 1 个社区插件 */
  'plugin:list': () => ({ ok: true, plugins: plgOn, third: third }),
  'plugin:toggle': (_e, p) => { plgOn[p.id] = !!p.enabled; return { ok: true, plugins: plgOn }; },
  'plugin:remove': (_e, p) => { third = third.filter(x => x.id !== p.id); return { ok: true }; },
  'plugin:open-dir': () => ({ ok: true })
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
  let lastJs = '';
  const js = (code) => { lastJs = code; return win.webContents.executeJavaScript(code, true); };

  /* ---- 1. 打开「游戏」页：整页 + 顶栏 + 两个页签 ---- */
  const home = await js(`(() => ({ tx: (document.getElementById('bdPlayTx') || {}).textContent,
      page: (document.querySelector('.page.active') || {}).id }))()`);
  ok(home.page === 'page-bedrock' && home.tx === '进入游戏', '主菜单上按钮仍是「进入游戏」', JSON.stringify(home));

  await js(`document.getElementById('bdGame').click()`);
  await sleep(900);
  const p1 = await js(`(() => {
    const sheet = document.getElementById('bdSheet');
    const root = document.getElementById('bdRoot');
    const ttl = document.querySelector('#bdSheet .bd-ttl');
    const top = document.querySelector('#bdSheet .bd-play-top');
    const soc = document.querySelector('#bdSheet .bd-play-soc');
    const tabs = Array.from(document.querySelectorAll('#bdSheet .bd-ptab'));
    const r = sheet.getBoundingClientRect();
    const tr = ttl.getBoundingClientRect();
    const sr = soc.getBoundingClientRect();
    return {
      cls: sheet.className, full: root.classList.contains('bd-full'), on: root.classList.contains('on'),
      w: Math.round(r.width), h: Math.round(r.height),
      ttl: ttl.textContent, ttlCx: Math.round(tr.left + tr.width / 2), winCx: Math.round(window.innerWidth / 2),
      socR: Math.round(sr.right), winW: Math.round(window.innerWidth),
      bar: getComputedStyle(top).backgroundColor,
      tabs: tabs.map(t => t.textContent.trim()),
      active: (document.querySelector('#bdSheet .bd-ptab.on') || {}).textContent,
      veiled: document.body.classList.contains('bd-veil'),
      menuHidden: getComputedStyle(document.querySelector('#page-bedrock .bd-menu')).visibility
    };
  })()`);
  ok(p1.on && /bd-play/.test(p1.cls) && p1.full, '「游戏」打开整页面板（bd-play + 半透明遮罩）', JSON.stringify({ cls: p1.cls, full: p1.full }));
  ok(p1.w === p1.winW || p1.w > 1200, '面板铺满整页（不是中间一块小弹窗）', p1.w + 'px / 窗口 ' + p1.winW);
  ok(p1.ttl === '游戏' && Math.abs(p1.ttlCx - p1.winCx) <= 2, '顶栏标题「游戏」居中', p1.ttlCx + ' vs ' + p1.winCx);
  ok(p1.bar === 'rgb(198, 198, 198)', '顶栏是那条浅灰条（跟设置页同色 #c6c6c6）', p1.bar);
  ok(p1.socR >= p1.winW - 30, '右上角是「社交 (N)」', p1.socR + ' / ' + p1.winW);
  ok(p1.tabs.length === 2 && p1.tabs[0] === '游戏' && p1.tabs[1] === '插件', '两个通栏页签：游戏 · 插件', p1.tabs.join(' / '));
  ok(p1.active === '游戏', '默认停在「游戏」页签', p1.active);
  ok(p1.veiled && p1.menuHidden === 'hidden', '主菜单那层被隐去，背景只剩全景', p1.menuHidden);

  /* ---- 2. 左侧切换版本 + 右侧启动游戏 ---- */
  const p2 = await js(`(() => {
    const lb = document.querySelector('#bdSheet .bd-play-vlb');
    const sel = document.getElementById('bdGameVer');
    const btn = document.getElementById('bdPlay');
    const slot = document.getElementById('bdGameSlot');
    const lr = lb ? lb.getBoundingClientRect() : null;
    const br = btn.getBoundingClientRect();
    const sr = sel.getBoundingClientRect();
    return {
      label: lb ? lb.textContent : '', selW: Math.round(sr.width), selVal: sel.value,
      selLeft: Math.round(sr.left), btnLeft: Math.round(br.left), btnRight: Math.round(br.right),
      winW: Math.round(window.innerWidth), btnW: Math.round(br.width), btnH: Math.round(br.height),
      tx: document.getElementById('bdPlayTx').textContent,
      inSlot: !!(slot && slot.querySelector('#bdPlay')),
      opts: Array.from(sel.options).map(o => o.textContent)
    };
  })()`);
  ok(p2.label === '切换版本', '页签那条线上左边写着「切换版本」', p2.label);
  ok(p2.selLeft < p2.winW / 2, '版本下拉在左侧', p2.selLeft + 'px');
  ok(p2.opts.length === 2 && p2.opts[0] === '1.21.4-Fabric', '下拉里是已装版本（加载器不重复拼）', p2.opts.join(' | '));
  ok(p2.inSlot && p2.tx === '启动游戏', '右边那颗绿色按钮文案是「启动游戏」', p2.tx);
  ok(p2.btnLeft > p2.winW / 2 && p2.btnW <= 260 && p2.btnH >= 30, '绿色按钮在右侧、尺寸正常', p2.btnLeft + 'px · ' + p2.btnW + '×' + p2.btnH);

  /* ---- 3. 面板里的存档 ---- */
  const p3 = await js(`(() => ({
    worlds: document.querySelectorAll('#bdWorlds .bd-world').length,
    first: (document.querySelector('#bdWorlds .bd-world .bd-world-meta b') || {}).textContent,
    h4: Array.from(document.querySelectorAll('#bdSheet .bd-play-pane.on h4')).map(h => h.textContent)
  }))()`);
  ok(p3.worlds === 3 && p3.first === '新的世界', '面板里按时间列出最近玩的存档', p3.worlds + ' 个 · 第一个 ' + p3.first);
  ok(p3.h4.indexOf('最近玩的存档') >= 0, '存档前有「最近玩的存档」小标题', p3.h4.join(','));

  /* ---- 4. 切到「插件」页签：跟普通模式「插件」页一样的内置 + 社区插件卡片 ---- */
  await js(`document.querySelector('#bdSheet .bd-ptab[data-ptab="addon"]').click()`);
  await sleep(700);
  const p4 = await js(`(() => {
    const cards = Array.from(document.querySelectorAll('#bdAddonList .bd-plg'));
    return {
      pane: (document.querySelector('#bdSheet .bd-play-pane.on') || {}).dataset.pane,
      n: cards.length,
      names: cards.map(c => (c.querySelector('.bd-plg-main b') || {}).firstChild ? c.querySelector('.bd-plg-main b').firstChild.textContent.trim() : ''),
      tags: cards.map(c => Array.from(c.querySelectorAll('.bd-tag')).map(t => t.textContent.trim()).join('/')),
      swOn: document.querySelectorAll('#bdAddonList .bd-sw.on').length,
      opens: document.querySelectorAll('#bdAddonList [data-act="plugopen"]').length,
      dirs: document.querySelectorAll('#bdAddonList [data-act="plugdir"]').length,
      dels: document.querySelectorAll('#bdAddonList [data-act="plugdel"]').length,
      stat: (document.getElementById('bdPlugStat') || {}).textContent,
      statShown: !document.getElementById('bdPlugStat').hidden,
      verHidden: document.getElementById('bdPlayVer').hidden,
      refShown: !document.getElementById('bdAddonRef').hidden,
      playHidden: document.getElementById('bdGameSlot').hidden
    };
  })()`);
  ok(p4.pane === 'addon', '点「插件」切到插件面板', p4.pane);
  ok(p4.n === 5, '列出内置 4 个 + 社区 1 个插件（跟普通模式那一页同一个数据源）', p4.n + ' 张卡');
  ok(p4.names.join(',') === '种子地图,一键开服,手柄控制,模组翻译器,示例社区插件', '卡片顺序：内置在前、社区在后', p4.names.join(' | '));
  ok(p4.swOn === 5 && p4.opens === 5, '每张卡都有启用开关与「打开」', '开关 ' + p4.swOn + ' · 打开 ' + p4.opens);
  ok(p4.dirs === 1 && p4.dels === 1, '只有社区插件才有「目录 / 删除」', '目录 ' + p4.dirs + ' · 删除 ' + p4.dels);
  ok(/内置 4 个 · 社区 1 个/.test(p4.stat) && p4.statShown, '页签横线上写出内置 / 社区数量', p4.stat);
  ok(p4.verHidden && p4.playHidden && p4.refShown, '插件页藏起「切换版本」与启动按钮，右侧换成「刷新插件」');

  /* ---- 5. 停用第一张卡：开关与卡片状态一起变 ---- */
  await js(`document.querySelector('#bdAddonList .bd-plg .bd-sw').click()`);
  await sleep(700);
  const p5 = await js(`(() => ({
    off: document.querySelectorAll('#bdAddonList .bd-plg.off').length,
    on: document.querySelectorAll('#bdAddonList .bd-sw.on').length,
    first: (document.querySelector('#bdAddonList .bd-plg') || {}).className,
    st: (document.querySelector('#bdAddonList .bd-plg .bd-plg-st') || {}).textContent
  }))()`);
  ok(p5.off === 1 && p5.on === 4 && /off/.test(p5.first), '点开关真的停用那一个插件（卡片变灰、开关归位）', p5.off + ' 张停用 · 开关 ' + p5.on);
  ok(p5.st === '已停用', '卡片底部写着「已停用」', p5.st);
  await js(`document.querySelector('#bdAddonList .bd-plg .bd-sw').click()`);
  await sleep(500);

  /* ---- 6. 存档空态 ---- */
  emptyMode = true;
  await js(`document.querySelector('#bdSheet .bd-ptab[data-ptab="game"]').click()`);
  await sleep(400);
  await js(`document.getElementById('bdGameVer').dispatchEvent(new Event('change', { bubbles: true }))`);
  await sleep(400);
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(400);
  await js(`document.getElementById('bdGame').click()`);
  await sleep(800);
  const p6b = await js(`(() => {
    const art = document.querySelector('#bdWorlds .bd-art');
    if (!art) return { has: false };
    const r = art.getBoundingClientRect();
    return { has: true, t: art.querySelector('.bd-art-t').textContent,
      cx: Math.round(r.left + r.width / 2), winCx: Math.round(window.innerWidth / 2),
      img: !!art.querySelector('.bd-art-img') };
  })()`);
  ok(p6b.has && /这里还没有存档/.test(p6b.t) && p6b.img, '存档为空时是「这里还没有存档…!」+ 像素画', p6b.t);
  ok(p6b.has && Math.abs(p6b.cx - p6b.winCx) <= 6, '存档空态占满整行并居中（不被挤成第一格）', p6b.cx + ' vs ' + p6b.winCx);

  /* ---- 7. 关掉回到主菜单，文案还原 ---- */
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(500);
  const p7 = await js(`(() => ({
    closed: !document.getElementById('bdRoot').classList.contains('on'),
    tx: document.getElementById('bdPlayTx').textContent,
    back: !!document.querySelector('#bdGameParts #bdPlay'),
    veil: document.body.classList.contains('bd-veil')
  }))()`);
  ok(p7.closed && p7.back, '关掉以后按钮回到主菜单原位', JSON.stringify(p7));
  ok(p7.tx === '进入游戏', '按钮文案还原成「进入游戏」', p7.tx);
  ok(!p7.veil, '主菜单那层恢复显示', String(p7.veil));

  /* ---- 8. 从游戏页点「社交」→ 关掉回到游戏页 ---- */
  emptyMode = false;
  await js(`document.getElementById('bdGame').click()`);
  await sleep(700);
  await js(`document.querySelector('#bdSheet .bd-play-soc').click()`);
  await sleep(700);
  const p8a = await js(`(() => ({ side: document.getElementById('bdSheet').classList.contains('bd-side'),
      on: document.getElementById('bdRoot').classList.contains('on') }))()`);
  ok(p8a.on && p8a.side, '游戏页右上角的「社交」打开右侧社交面板', JSON.stringify(p8a));
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(700);
  const p8b = await js(`(() => ({ play: document.getElementById('bdSheet').classList.contains('bd-play'),
      on: document.getElementById('bdRoot').classList.contains('on'),
      tx: document.getElementById('bdPlayTx').textContent }))()`);
  ok(p8b.on && p8b.play, '关掉社交回到「游戏」页（不甩回主菜单）', JSON.stringify(p8b));

  /* ---- 9. Esc 关闭 ---- */
  await js(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(500);
  const p9 = await js(`(() => ({ off: !document.getElementById('bdRoot').classList.contains('on'),
      page: (document.querySelector('.page.active') || {}).id }))()`);
  ok(p9.off && p9.page === 'page-bedrock', 'Esc 关掉游戏页，人还在基岩版主菜单', JSON.stringify(p9));

  /* ---- 10. 普通模式不受影响 ---- */
  await js(`gotoPage('home')`);
  await sleep(800);
  const p10 = await js(`(() => ({ sheet: !!document.querySelector('#bdRoot.on'),
      body: document.body.className.indexOf('bd-veil') < 0,
      play: document.getElementById('bdPlayTx') ? document.getElementById('bdPlayTx').textContent : '?' }))()`);
  ok(!p10.sheet && p10.body, '普通模式里没有基岩版面板残留', JSON.stringify(p10));

  const fails = lines.filter(l => l.startsWith('FAIL')).length;
  fs.writeFileSync(path.join(OUT, 'play-1410-result.txt'), lines.join('\n') + '\n', 'utf8');
  console.log('\n[PLAY-JS] ' + (fails ? 'FAIL' : 'PASS') + ' · ' + lines.length + ' 项 · 失败 ' + fails);
  app.exit(fails ? 1 : 0);
}).catch(e => {
  console.error('[PLAY-JS] CRASH', e && e.stack || e);
  app.exit(2);
});
