/* 基岩版主题验收（桩掉 IPC，只验界面与交互）：
 *   ① 设置 → 个性化 里有第三个主题，点了之后 body 挂 bedrock-mode / bd-home
 *   ② 主菜单：标题图、启动 / 版本 / 好友 / 联机 / 设置、更衣室 / 切换账户都在；
 *      右下角有常驻的 3D 角色（真的在画）；左上角那个「启动器」按钮已经删掉
 *   ③ 版本下拉：列出全部实例，点了会同步 #selVersion 与按钮文案
 *   ④ 没有实例时点「启动」= 带去下载页
 *   ⑤ 设置弹层：6 个页签，「功能」页签是下载 / 实例等页面的入口
 *   ⑥ 好友 / 切换账户 / 更衣室 / 联机：全部在弹层里做完，不再跳旧页面；
 *      联机的陶瓦控件与添加账户表单是「借」进弹层的，关掉后必须回到原位置
 *   ⑦ 切回深色：body 类清干净、回主页
 * 用法：./node_modules/.bin/electron qa/bedrock-ui.js
 * 产物：qa/out/bd-*.png
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
/* 音效断言只看「有没有走播放分支」，不需要真的出声；
   而且这台机器的扬声器不该在跑测试时响 —— 一律静音。 */
app.commandLine.appendSwitch('mute-audio');

const VERSION = '1.4.6';

const cfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: VERSION, autoCheckUpdate: false, seenVersion: VERSION,
  railPosition: 'left', theme: 'dark', accentColor: '', bgMode: 'default',
  activeAccount: 'Steve', lastVersion: '1.21.4-fabric', startPage: 'home',
  railOrder: [], railHidden: [], uiSound: true, uiSoundVol: 0.55,
  launcherVisibility: 'keep', forceChinese: true, forceIsolate: 'auto', defaultVersion: ''
};

const accounts = [
  { name: 'Steve', type: 'offline', model: 'classic', skin: false, skinUrl: '' },
  { name: 'Alex', type: 'offline', model: 'slim', skin: false, skinUrl: '' }
];

/* 邀请联机测试要用的两个可变状态（在测试里直接改，桩每次被调用时现读）：
   PRES_ON  把第一个好友标成「在线」，才能走到真的发信令那一步
   SIGNALS  记录所有发出去的信令（invite / accept / reject），断言从这儿读 */
let PRES_ON = false;
const SIGNALS = [];

const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({
    ok: true, broken: [], versions: [
      { id: '1.21.4-fabric', dir: '1.21.4-fabric', hasJson: true, loader: 'Fabric', loaderVer: '0.20.1' },
      { id: '1.21.4', dir: '1.21.4', hasJson: true, loader: 'Vanilla', isBase: true }
    ],
    /* 扫描结果里本来就带存档（主进程 dir:scan 的返回结构）—— 资源页的「目标存档」
       和「装 MOD 挑实例」都读它，缺了数据包那一栏就是空的 */
    saves: [
      { name: '新的世界', levelName: '新的世界', instance: '1.21.4-fabric', lastPlayed: 1794900000000 },
      { name: '老存档', levelName: '我的世界（1）', instance: '1.21.4-fabric', lastPlayed: 1794000000000 },
      { name: '更老的', levelName: '生存', instance: '1.21.4', lastPlayed: 1793000000000 }
    ]
  }),
  'java:list': () => ({ ok: true, javas: [{ path: 'C:////Java////bin////java.exe', major: 21 }], major: 21 }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: {
    latest: { release: '1.21.4', snapshot: '26.4-snapshot-2' },
    versions: [
      { id: '26.4-snapshot-2', type: 'snapshot', releaseTime: '2026-11-10T10:00:00+00:00' },
      { id: '1.21.4', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' },
      { id: '1.21.3', type: 'release', releaseTime: '2026-09-20T10:00:00+00:00' },
      { id: '1.20.1', type: 'release', releaseTime: '2023-06-12T10:00:00+00:00' },
      { id: 'b1.7.3', type: 'old_beta', releaseTime: '2011-07-08T10:00:00+00:00' }
    ] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'update:check': () => ({ ok: true, current: VERSION, latest: VERSION, hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts, active: cfg.activeAccount }),
  'account:switch': (_e, p) => {
    if (!accounts.some(a => a.name === (p && p.name))) return { ok: false, error: 'no such account' };
    cfg.activeAccount = p.name;
    cfg.username = p.name;
    return { ok: true, accounts, active: p.name };
  },
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, gameDir: 'D:////////X', saves: [
    { name: '新的世界', levelName: '新的世界', instance: '1.21.4-fabric', lastPlayed: 1794900000000, icon: null },
    { name: '老存档', levelName: '我的世界（1）', instance: '1.21.4-fabric', lastPlayed: 1794000000000, icon: null },
    { name: '更老的', levelName: '生存', instance: '1.21.4', lastPlayed: 1793000000000, icon: null }
  ] }),
  /* 资源搜索桩：每类给两条，用来验「基岩版下载页能不能搜到东西 + 有没有安装按钮」 */
  'modrinth:search': (_e, p) => {
    const type = (p && p.type) || 'mod';
    const q = String((p && p.query) || '').trim().toLowerCase();
    const H = {
      mod: [
        { id: 'sodium', title: 'Sodium', titleZh: '钠', titleMain: '钠（Sodium）', descZh: '现代渲染优化，帧数翻倍', downloads: 1234567, author: 'CaffeineMC', src: 'modrinth' },
        { id: 'jei', title: 'Just Enough Items', titleZh: 'JEI 物品管理器', titleMain: 'JEI 物品管理器（Just Enough Items）', descZh: '一览所有配方', downloads: 987654, author: 'mezz', src: 'modrinth' }
      ],
      modpack: [
        { id: 'fabulously-optimized', title: 'Fabulously Optimized', titleMain: 'Fabulously Optimized', descZh: '轻量优化整合包', downloads: 432100, author: 'Robotkoer', src: 'modrinth' }
      ],
      resourcepack: [
        { id: 'faithful', title: 'Faithful 32x', titleMain: 'Faithful 32x', descZh: '原版高清化', downloads: 765432, author: 'Faithful', src: 'modrinth' }
      ],
      shader: [
        { id: 'complementary', title: 'Complementary Reimagined', titleMain: 'Complementary Reimagined', descZh: '写实光影，性能友好', downloads: 321098, author: 'EminGT', src: 'modrinth' }
      ],
      datapack: [
        { id: 'terralith', title: 'Terralith', titleMain: 'Terralith', descZh: '重写地形生成', downloads: 210987, author: 'Starmute', src: 'modrinth' }
      ]
    };
    let hits = (H[type] || []).slice();
    if (q) hits = hits.filter(h => (h.title + h.titleZh + h.titleMain + h.descZh).toLowerCase().includes(q));
    return { ok: true, total: hits.length, hits };
  },
  'plugin:list': () => ({ ok: true, items: [] }),
  'friends:get': () => ({ ok: true, code: 'ABCD-EFGH-JKLM', friends: [
    { code: 'WXYZ-2345-6789', name: 'StarMantis2357' },
    { code: 'ABCD-1111-2222', name: 'HealerXB' },
    { code: 'EFGH-3333-4444', name: 'Earylliner54237' }
  ] }),
  'friends:presence': () => ({
    ok: true, connected: true,
    status: PRES_ON ? { 'WXYZ-2345-6789': { online: true, lastSeen: Date.now() } } : {}
  }),
  /* 真的走 IP 通道：记录发出去的信令，供「邀请联机 / 同意 / 拒绝」断言 */
  'friends:signal-send': (_e, p) => { SIGNALS.push(p); return { ok: true }; },
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'friends:add': (_e, p) => ({ ok: true, friends: [{ code: p && p.code, name: '新朋友' }] }),
  'friends:remove': () => ({ ok: true, friends: [] }),
  'mp:status': () => ({ ok: true, installed: false }),
  'mp:state': () => ({ ok: true, state: { mode: 'idle' } }),
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
let lastJs = '';   /* 出错的页面脚本（CRASH 时打印，定位卡在哪一步） */
const ok = (c, n, e) => {
  const line = (c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : '');
  lines.push(line);
  console.log(line);   /* 立刻打一行：跑到一半卡住时能看出停在哪一项 */
};

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false, frame: false, width: 1280, height: 880, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true }
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2600);
  const js = (code) => { lastJs = code; return win.webContents.executeJavaScript(code, true); };
  const shot = async (name) => {
    try { win.webContents.invalidate(); } catch (_) {}
    await sleep(340);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  };

  /* ---- 1. 主题入口（1.3.1：基岩版从「界面主题」挪到「实验性功能」分区） ---- */
  const grid = await js(`(() => Array.from(document.querySelectorAll('#themeGrid .theme-opt')).map(b => b.dataset.theme))()`);
  ok(grid.length === 2 && !grid.includes('bedrock'), '界面主题只剩 浅色 / 深色', grid.join(','));
  const exp = await js(`(() => {
    const b = document.getElementById('btnBedrockTheme');
    const g = document.getElementById('expGroup');
    const bg = Array.from(document.querySelectorAll('#page-personal input[name=bgMode]')).map(r => r.value);
    return { btn: !!b, group: g ? g.textContent.replace(/\\s+/g, '') : '', bg };
  })()`);
  ok(exp.btn && /实验性功能/.test(exp.group), '新增「实验性功能」分区，基岩版开关在里面', exp.group.slice(0, 16));
  ok(!exp.bg.includes('panorama'), '个性化背景里删掉了「MC 全景」', exp.bg.join(','));
  ok(!!(await js(`typeof window.BEDROCK === 'object'`)), '基岩版模块已加载');

  await js(`document.getElementById('btnBedrockTheme').click()`);
  await sleep(900);

  const d1 = await js(`(() => {
    const b = document.body;
    const rail = document.getElementById('rail');
    const cv = document.getElementById('bdSkinCv');
    let pix = 0;
    try { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) pix++; } catch (e) {}
    return {
      theme: S.config.theme,
      mode: b.classList.contains('bedrock-mode'),
      home: b.classList.contains('bd-home'),
      page: (document.querySelector('.page.active') || {}).id,
      rail: rail ? getComputedStyle(rail).display : 'none',
      navBtn: !!document.getElementById('bdNavBtn'),
      logo: (() => { const i = document.getElementById('bdLogo'); return i && i.naturalWidth; })(),
      playTx: (document.getElementById('bdPlayTx') || {}).textContent,
      model: { cv: !!cv, mounted: BEDROCK.debug().model.mounted, pix: pix },
      menu: Array.from(document.querySelectorAll('.bd-stack .bd-mbtn')).map(b => b.textContent.trim()),
      purple: ((document.querySelector('.bd-stack .bd-purple') || {}).textContent || '').trim(),
      social: (() => { const s = document.getElementById('bdSocial'); return s ? s.textContent.replace(/\\s+/g, '') : ''; })(),
      parts: (() => { const g = document.getElementById('bdGameParts'); return g ? g.hidden : null; })(),
      btns: ['bdGame', 'bdSettings', 'bdLan', 'bdDownload', 'bdPlay', 'bdDress', 'bdAccount', 'bdSocial']
        .filter(id => !!document.getElementById(id)).length
    };
  })()`);

  ok(d1.theme === 'bedrock', '主题写入配置（theme=bedrock）', d1.theme);
  ok(d1.mode && d1.home, 'body 挂上 bedrock-mode + bd-home');
  ok(d1.page === 'page-bedrock', '主页换成了基岩版主菜单', d1.page);
  ok(d1.rail === 'none', '主菜单页收起侧栏', d1.rail);
  ok(d1.navBtn === false, '左上角「启动器」按钮已删除');
  ok(d1.logo > 100, '标题图真的载入', d1.logo + 'px');

  /* 背景全景：MC 最新版的 4:1 长条，由 JS 逐帧横移（不吃 prefers-reduced-motion，真的会转） */
  const pano = JSON.parse(await js(`(async () => {
    const p = document.getElementById('bdPano');
    if (!p) return JSON.stringify({ has: false });
    const cs = getComputedStyle(p);
    const bg = cs.backgroundImage || '';
    const url = (bg.match(/url\\("?([^")]+)"?\\)/) || [])[1] || '';
    const size = await new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => r('ERR'); i.src = url; });
    const t1 = p.style.transform || '';
    await new Promise(r => setTimeout(r, 900));
    const t2 = p.style.transform || '';
    return JSON.stringify({ has: true, url: url.split('/').slice(-1)[0], size, t1, t2,
      w: p.offsetWidth, h: p.offsetHeight });
  })()`));
  ok(pano.has && /^panorama\.jpg$/.test(pano.url) && pano.size === '4096x1024', '背景是 MC 最新版全景长条', pano.url + ' ' + pano.size);
  ok(pano.w > pano.h * 3.5, '长条按 4:1 等比铺开（不拉伸不压扁）', pano.w + 'x' + pano.h);
  ok(pano.t1 !== pano.t2, '背景一直在慢慢转（JS 逐帧位移，不吃 reduced-motion）', pano.t1 + ' → ' + pano.t2);

  /* 1.4.0 版式：四颗竖排按钮（游戏 / 设置 / 联机 / 下载）+ 右上角社交 */
  ok(d1.menu.join('/') === '游戏/设置/联机/下载', '主菜单是四颗按钮：游戏 / 设置 / 联机 / 下载', d1.menu.join('/'));
  ok(d1.purple === '联机', '第三颗（紫色）是联机', d1.purple);
  ok(/^社交\(\d+\)$/.test(d1.social), '右上角有「社交 (n)」', d1.social);
  ok(d1.playTx === '进入游戏', '启动按钮文案改成「进入游戏」', d1.playTx);
  ok(d1.parts === true, '「进入游戏」平时收在 #bdGameParts 里（点「游戏」才拿进弹层）', d1.parts);
  ok(d1.btns === 8, '8 个交互入口都在（含社交）', d1.btns);
  ok(d1.model.cv && d1.model.mounted, '右侧有常驻的 3D 角色', JSON.stringify(d1.model));
  ok(d1.model.pix > 600, '常驻角色真的画出来了（不是空画布）', d1.model.pix + ' px');

  /* 真实窗口尺寸：模型在右侧，不能压到中间那列按钮；更衣室 / 切换账户在模型下面 */
  const geo = await js(`(() => {
    const m = document.getElementById('bdModel').getBoundingClientRect();
    const s = document.getElementById('bdSettings').getBoundingClientRect();
    const d = document.getElementById('bdDress').getBoundingClientRect();
    const a = document.getElementById('bdAccount').getBoundingClientRect();
    const c = document.getElementById('bdSkinCv').getBoundingClientRect();
    return { modelL: Math.round(m.left), modelB: Math.round(m.bottom), setR: Math.round(s.right),
      dressT: Math.round(d.top), dressL: Math.round(d.left), accT: Math.round(a.top), accL: Math.round(a.left),
      cvB: Math.round(c.bottom), h: window.innerHeight, w: window.innerWidth };
  })()`);
  ok(geo.modelL > geo.setR + 40, '模型在右侧，不压中间那列按钮', JSON.stringify(geo));
  ok(geo.dressT >= geo.cvB - 6 && geo.accT > geo.dressT && geo.dressL >= geo.modelL - 40,
    '更衣室在上面、切换账户在下面，都在模型这块里竖排', geo.dressT + '/' + geo.accT);
  ok(geo.modelB <= geo.h, '模型没有超出窗口底部', geo.modelB + '/' + geo.h);

  /* 按钮材质：照游戏 GUI —— 直角、纯色浅灰、1px 黑边，悬停整块变绿 */
  const mat = await js(`(() => {
    const b = document.getElementById('bdGame'); const cs = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return { bg: cs.backgroundColor, color: cs.color, radius: cs.borderTopLeftRadius,
      border: cs.borderTopColor + ' ' + cs.borderTopWidth,
      h: Math.round(r.height), w: Math.round(r.width), fs: cs.fontSize };
  })()`);
  ok(/rgb\(198, 198, 198\)/.test(mat.bg) && /rgb\(16, 16, 16\)/.test(mat.border), '按钮是纯色浅灰 + 黑描边（游戏里的方块材质）', mat.bg + ' / ' + mat.border);
  ok(mat.radius === '0px', '按钮是直角（不是圆角胶囊）', mat.radius);
  ok(mat.h >= 38 && mat.h <= 48 && mat.w >= 190 && mat.w <= 300, '按钮尺寸照游戏：窄方块条', mat.w + 'x' + mat.h + ' ' + mat.fs);
  /* 悬停变绿：直接读 :hover 规则（真鼠标悬停在无头窗口里不可靠） */
  const hover = await js(`(() => {
    for (const ss of document.styleSheets) {
      let rules = []; try { rules = ss.cssRules; } catch (e) { continue; }
      for (const r of rules) if (r.selectorText === '.bd-btn:hover') return r.style.backgroundColor || r.style.background || '';
    }
    return '';
  })()`);
  ok(/rgb\(106, 176, 74\)|#6ab04a/.test(hover.replace(/\s/g, ' ')), '悬停整块变绿', hover.slice(0, 40));

  await shot('bd-1-menu');

  /* 小窗口（1024x640）：标题 / 按钮不能被挤出屏幕，「下载」要还在可视区里 */
  win.setContentSize(1024, 640);
  await sleep(900);
  const fit = await js(`(() => {
    const ids = ['bdLogo', 'bdGame', 'bdSettings', 'bdDownload', 'bdSocial'];
    const out = {};
    for (const id of ids) { const r = document.getElementById(id).getBoundingClientRect(); out[id] = Math.round(r.bottom); }
    out.h = window.innerHeight; return out;
  })()`);
  ok(fit.bdDownload <= fit.h - 40 && fit.bdLogo > 0 && fit.bdSocial > 0, '1024x640 下按钮都还在可视区', JSON.stringify(fit));
  await shot('bd-1b-menu-small');
  win.setContentSize(1280, 880);
  await sleep(700);

  /* ---- 2. 「游戏」弹层：进入游戏 + 版本 + 最近玩的存档 ---- */
  await js(`document.getElementById('bdGame').click()`);
  await sleep(600);
  const g1 = await js(`(() => ({
    on: document.getElementById('bdRoot').classList.contains('on'),
    title: (document.querySelector('#bdSheet .bd-ttl') || {}).textContent,
    inSlot: !!document.querySelector('#bdGameSlot #bdPlay'),
    playTx: (document.getElementById('bdPlayTx') || {}).textContent,
    opts: Array.from(document.querySelectorAll('#bdGameVer option')).map(o => o.value),
    sel: (document.getElementById('bdGameVer') || {}).value,
    worlds: document.querySelectorAll('#bdWorlds .bd-world').length,
    first: ((document.querySelector('#bdWorlds .bd-world .bd-world-meta b') || {}).textContent || ''),
    nav: document.querySelectorAll('#bdSheet .bd-tab, #bdSheet .bd-tabs').length
  }))()`);
  ok(g1.on && g1.title === '游戏', '点「游戏」打开游戏弹层', g1.title);
  ok(g1.inSlot && /启动游戏|进入游戏|关闭/.test(g1.playTx), '绿色「启动游戏」借进弹层（还是原来那一颗）', g1.playTx);
  /* 1.4.15：原版基座不再出现在「切换版本」里，所以这里只剩加载器那一条 */
  ok(g1.opts.length === 1 && g1.sel === '1.21.4-fabric', '弹层里只列加载器实例（原版基座被藏），默认当前', g1.opts.join(',') + ' / ' + g1.sel);
  ok(g1.worlds === 3 && /新的世界/.test(g1.first), '下面列出最近玩的存档（按时间倒序）', g1.worlds + ' 个 · 第一个=' + g1.first);
  ok(g1.nav === 0, '顶部那行「世界 / Reams / 服务器」导航已删掉', g1.nav);
  await shot('bd-2-game');

  await js(`(() => { const s = document.getElementById('bdGameVer'); s.value = '1.21.4'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
  await sleep(450);
  const g2 = await js(`(() => ({ sel: document.getElementById('selVersion').value, hasBase: Array.from(document.querySelectorAll('#bdGameVer option')).some(o => o.value === '1.21.4') }))()`);
  ok(g2.hasBase === false && g2.sel === '1.21.4-fabric', '基座不在切换版本下拉里（硬设也切不过去）', JSON.stringify(g2));

  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(400);
  const g3 = await js(`(() => ({ closed: !document.getElementById('bdRoot').classList.contains('on'),
      back: !!document.querySelector('#bdGameParts #bdPlay') }))()`);
  ok(g3.closed && g3.back, '关掉弹层后「进入游戏」原样回到主页', JSON.stringify(g3));

  /* ---- 2b. 社交面板 ---- */
  /* 收藏 / 静音 / 拉黑 存在 localStorage，先清掉，免得上一次跑的结果影响这一轮 */
  await js(`(() => { try { localStorage.removeItem('xlc.bd.social'); } catch (e) {} return 1; })()`);
  await js(`document.getElementById('bdSocial').click()`);
  await sleep(700);
  const sc1 = await js(`(() => ({
    on: document.getElementById('bdRoot').classList.contains('on'),
    side: document.getElementById('bdSheet').classList.contains('bd-side'),
    search: !!document.getElementById('bdSocSearch'),
    tabs: Array.from(document.querySelectorAll('#bdSheet .bd-soc-tab')).map(b => b.textContent),
    me: ((document.querySelector('#bdSocBody .bd-soc-me .bd-soc-nm b') || {}).textContent || '').replace(/\\s+/g, ''),
    secs: Array.from(document.querySelectorAll('#bdSocBody .bd-soc-sec')).map(s => s.textContent.trim()),
    rows: document.querySelectorAll('#bdSocBody .bd-soc-row').length,
    more: document.querySelectorAll('#bdSocBody .bd-soc-more').length
  }))()`);
  ok(sc1.on && sc1.side, '「社交」在右侧滑出面板', sc1.side);
  ok(sc1.search && sc1.tabs.join('/') === '玩家/好友码', '有搜索框 + 玩家 / 好友码 页签', sc1.tabs.join('/'));
  ok(/Steve/.test(sc1.me) && /\(你\)/.test(sc1.me), '顶部是我自己（名字 + 「(你)」）', sc1.me);
  ok(sc1.secs.join('|').includes('在线 (0)') && sc1.secs.join('|').includes('离线 (3)'), '在线 / 离线 分组都在', sc1.secs.join('|'));
  ok(sc1.rows === 3 && sc1.more === 3, '离线 3 个好友，每行都有「⋮」', sc1.rows);
  await shot('bd-2b-social');

  await js(`document.querySelector('#bdSocBody [data-socmore]').click()`);
  await sleep(350);
  const sc2 = await js(`(() => ({
    on: document.getElementById('bdSocOpts').classList.contains('on'),
    items: Array.from(document.querySelectorAll('#bdSocOptBox [data-popt]')).map(b => b.textContent),
    ttl: (document.querySelector('#bdSocOptBox .bd-soc-optttl') || {}).textContent,
    invDisabled: !!(document.querySelector('#bdSocOptBox [data-popt="invite"]') || {}).disabled,
    hint: ((document.querySelector('#bdSocOptBox .bd-soc-opt-hint') || {}).textContent || '')
  }))()`);
  ok(sc2.on && sc2.items.join('/') === '邀请联机/添加到收藏夹/静音/拉黑/举报/移除好友/取消',
    '「⋮」打开的选项：邀请联机 + 收藏夹 / 静音 / 拉黑 / 举报 / 移除好友', sc2.items.join('/'));
  ok(sc2.invDisabled && /当前离线/.test(sc2.hint), '对方离线时「邀请联机」置灰并写明原因', JSON.stringify({ d: sc2.invDisabled, h: sc2.hint }));
  await shot('bd-2c-social-opts');

  await js(`document.querySelector('#bdSocOptBox [data-popt="fav"]').click()`);
  await sleep(500);
  const sc3 = await js(`(() => ({
    closed: !document.getElementById('bdSocOpts').classList.contains('on'),
    tag: ((document.querySelector('#bdSocBody .bd-soc-tag') || {}).textContent || '')
  }))()`);
  ok(sc3.closed && sc3.tag === '收藏', '点了「添加到收藏夹」后列表出现「收藏」标记', sc3.tag);

  await js(`(() => { const i = document.getElementById('bdSocSearch'); i.value = 'zzzz'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await sleep(500);
  const sc4 = await js(`(() => ({ rows: document.querySelectorAll('#bdSocBody .bd-soc-row').length,
      empty: (document.getElementById('bdSocBody') || {}).textContent.includes('还没有好友') }))()`);
  ok(sc4.rows === 0 && sc4.empty, '搜索框能过滤人员', sc4.rows + ' 行');

  await js(`document.querySelectorAll('#bdSheet .bd-soc-tab')[1].click()`);
  await sleep(600);
  const sc5 = await js(`(() => ({ code: ((document.getElementById('bdFrCode') || {}).textContent || ''),
      input: !!document.getElementById('bdFrInput') }))()`);
  ok(/-/.test(sc5.code) && sc5.input, '切到「好友码」能看自己的码 / 加好友', sc5.code);

  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(400);

  /* ---- 2d. 邀请联机：真的发信令（不是摆设） ---- */
  PRES_ON = true;                       /* 把 StarMantis2357 标成在线 */
  await js(`document.getElementById('bdSocial').click()`);
  await sleep(700);
  /* 上一段把搜索框写成了 zzzz（还把页签停在「好友码」）—— 两样都得复位，
     否则这一轮看到的是一个空列表 */
  await js(`(() => { const i = document.getElementById('bdSocSearch'); if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); } return 1; })()`);
  await sleep(400);
  await js(`document.querySelector('#bdSheet .bd-soc-tab[data-soc="players"]').click()`);
  await sleep(700);
  const inv0 = await js(`(() => ({ rows: document.querySelectorAll('#bdSocBody .bd-soc-row').length,
      on: (document.querySelectorAll('#bdSocBody .bd-soc-sec')[0] || {}).textContent || '' }))()`);
  ok(inv0.rows === 3 && /在线 \(1\)/.test(inv0.on), '好友上线后归到「在线」分组', inv0.on);

  await js(`document.querySelector('#bdSocBody [data-socmore]').click()`);
  await sleep(300);
  const inv1 = await js(`(() => { const b = document.querySelector('#bdSocOptBox [data-popt="invite"]');
      return { tx: b.textContent, dis: b.disabled, green: b.classList.contains('bd-green'),
        hint: !!document.querySelector('#bdSocOptBox .bd-soc-opt-hint') }; })()`);
  ok(/邀请联机/.test(inv1.tx) && !inv1.dis && inv1.green && !inv1.hint,
    '在线好友的「邀请联机」可点，并且是绿色主按钮', JSON.stringify(inv1));
  await shot('bd-2f-social-invite');

  await js(`document.querySelector('#bdSocOptBox [data-popt="invite"]').click()`);
  await sleep(900);
  const inv2 = await js(`(() => ({
      tag: Array.from(document.querySelectorAll('#bdSocBody .bd-soc-tag')).map(t => t.textContent),
      pending: BEDROCK.debug().sheet === 'social'
  }))()`);
  const sent = SIGNALS.filter(x => x && x.payload && x.payload.type === 'invite');
  ok(sent.length === 1 && sent[0].to === 'WXYZ-2345-6789' && sent[0].payload.inviteId,
    '点「邀请联机」真的往对方频道发出 invite 信令', JSON.stringify(sent[0] || null));
  ok(inv2.tag.includes('邀请中'), '对方那一行出现「邀请中」标记', inv2.tag.join(','));
  await shot('bd-2g-social-pending');

  /* 同一个菜单再点一次：按钮变「邀请已发出」且置灰，不会重复发 */
  await js(`document.querySelector('#bdSocBody [data-socmore]').click()`);
  await sleep(300);
  const inv3 = await js(`(() => { const b = document.querySelector('#bdSocOptBox [data-popt="invite"]');
      return { tx: b.textContent, dis: b.disabled }; })()`);
  ok(/等待回应/.test(inv3.tx) && inv3.dis, '重复邀请会被拦住（按钮显示等待回应）', inv3.tx);
  await js(`document.querySelector('#bdSocOptBox [data-popt="cancel"]').click()`);
  await sleep(200);
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(400);

  /* ---- 2e. 收到别人的邀请：基岩版弹层里同意 / 拒绝 ---- */
  await js(`showInviteDialog({ type: 'invite', from: 'WXYZ-2345-6789', name: 'StarMantis2357', inviteId: 'qainv1' })`);
  await sleep(600);
  const inv4 = await js(`(() => ({
      on: document.getElementById('bdRoot').classList.contains('on'),
      kind: BEDROCK.debug().sheet,
      ttl: ((document.querySelector('#bdSheet .bd-ttl') || {}).textContent || ''),
      who: ((document.querySelector('#bdSheet .bd-inv-ttl') || {}).textContent || ''),
      yes: !!document.querySelector('#bdSheet [data-act="invok"]'),
      no: !!document.querySelector('#bdSheet [data-act="invno"]')
  }))()`);
  ok(inv4.on && inv4.kind === 'invite', '基岩版主题下收到的邀请用基岩版弹层显示（不是旧深色弹窗）', inv4.kind);
  ok(/StarMantis2357/.test(inv4.who) && inv4.yes && inv4.no, '弹层写明是谁邀请 + 同意 / 拒绝两颗按钮', inv4.who);
  await shot('bd-2h-invite-sheet');

  await js(`document.querySelector('#bdSheet [data-act="invok"]').click()`);
  await sleep(900);
  const inv5 = await js(`(() => ({ page: (document.querySelector('.page.active') || {}).id,
      kind: BEDROCK.debug().sheet }))()`);
  const acc = SIGNALS.filter(x => x && x.payload && x.payload.type === 'accept');
  ok(acc.length === 1 && acc[0].to === 'WXYZ-2345-6789' && acc[0].payload.inviteId === 'qainv1',
    '点「同意」真的回了 accept（对方收到就开始建房）', JSON.stringify(acc[0] || null));
  /* 1.4.8：同意后不再跳普通版联机页（那样会突然冒出侧栏、整页变深色），
     改成留在基岩版主菜单、把「联机」弹层打开，进度就写在弹层里 */
  ok(inv5.page === 'page-bedrock' && inv5.kind === 'lan', '同意后留在基岩版主菜单 + 联机弹层看进度', JSON.stringify(inv5));

  /* 拒绝分支也要通：再收一条，点拒绝 */
  await js(`gotoPage('bedrock')`);
  await sleep(500);
  await js(`showInviteDialog({ type: 'invite', from: 'ABCD-1111-2222', name: 'HealerXB', inviteId: 'qainv2' })`);
  await sleep(500);
  await js(`document.querySelector('#bdSheet [data-act="invno"]').click()`);
  await sleep(600);
  const rej = SIGNALS.filter(x => x && x.payload && x.payload.type === 'reject');
  ok(rej.length === 1 && rej[0].payload.inviteId === 'qainv2', '点「拒绝」回了 reject', JSON.stringify(rej[0] || null));

  PRES_ON = false;

  /* ---- 3. 声音 ---- */
  const s1 = await js(`(() => ({ can: BEDROCK.playSfx('click'), vol: BEDROCK.debug().sound }))()`);
  ok(s1.can === true && s1.vol > 0.2, '点击音效可用（音量跟随配置）', JSON.stringify(s1));

  /* ---- 4. 设置弹层：6 页签 + 「功能」页能进其它页面 ---- */
  await js(`document.getElementById('bdSettings').click()`);
  await sleep(500);
  const st1 = await js(`(() => ({ on: document.getElementById('bdRoot').classList.contains('on'),
      tabs: document.querySelectorAll('#bdSheet .bd-tab').length,
      panes: document.querySelectorAll('#bdSheet .bd-pane').length,
      cur: (document.querySelector('#bdSheet .bd-pane.on') || {}).dataset,
      labels: Array.from(document.querySelectorAll('#bdSheet .bd-tab')).map(b => b.textContent),
      title: document.querySelector('#bdSheet .bd-ttl').textContent }))()`);
  ok(st1.on && st1.title === '设置', '设置弹层打开', st1.title);
  /* 1.4.5：设置里「功能」板块整个移除；「诊断」改成独立页签 */
  ok(st1.tabs === 6 && st1.panes === 6, '6 个页签 / 6 个面板（功能页已删、诊断独立）', st1.tabs + '/' + st1.panes);
  ok(st1.cur && st1.cur.pane === 'general', '默认停在「通用」', st1.cur && st1.cur.pane);
  /* 1.4.9：设置打开时主菜单整层隐去，背景只剩全景（不再透出四个大按钮） */
  const veil1 = await js(`(() => {
    const v = s => { const el = document.querySelector(s); return el ? getComputedStyle(el).visibility : 'missing'; };
    return { veil: document.body.classList.contains('bd-veil'), menu: v('#page-bedrock .bd-menu'),
      corner: v('#page-bedrock .bd-corner'), mode: v('#bdMode'), social: v('#bdSocial'),
      pano: !!document.querySelector('#page-bedrock .bd-pano-strip') };
  })()`);
  ok(veil1.veil && veil1.menu === 'hidden' && veil1.corner === 'hidden' && veil1.mode === 'hidden' && veil1.social === 'hidden',
    '设置页背景只剩全景（主菜单按钮 / 3D 角色 / 左上开关都隐去）', JSON.stringify(veil1));
  await shot('bd-2-settings');

  await js(`document.querySelector('#bdSheet .bd-tab[data-tab="sound"]').click()`);
  await sleep(260);
  const tabOn = await js(`(document.querySelector('#bdSheet .bd-pane.on') || {}).dataset.pane`);
  ok(tabOn === 'sound', '能切到「音效」页', tabOn);
  await js(`document.querySelector('#bdSheet .bd-segbtn[data-set="uiSound"][data-val="0"]').click()`);
  await sleep(420);
  const s2 = await js(`(() => ({ cfg: S.config.uiSound, can: BEDROCK.playSfx('click'), on: document.querySelector('#bdSheet .bd-segbtn[data-set="uiSound"][data-val="0"]').classList.contains('on') }))()`);
  ok(s2.cfg === false && s2.can === false && s2.on, '关掉音效后不再播放，开关状态正确', JSON.stringify(s2));
  await js(`document.querySelector('#bdSheet .bd-segbtn[data-set="uiSound"][data-val="1"]').click()`);
  await sleep(380);
  const s3 = await js(`(() => ({ cfg: S.config.uiSound, can: BEDROCK.playSfx('tick') }))()`);
  ok(s3.cfg === true && s3.can === true, '再打开后恢复', JSON.stringify(s3));

  await js(`(() => { const r = document.getElementById('bdVol'); r.value = '30'; r.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(700);
  const s4 = await js(`(() => ({ vol: S.config.uiSoundVol, label: document.getElementById('bdVolVal').textContent }))()`);
  ok(Math.abs(s4.vol - 0.3) < 0.01, '音量滑块写进配置', s4.vol + ' / ' + s4.label);

  await js(`document.querySelector('#bdSheet .bd-tab[data-tab="look"]').click()`);
  await sleep(240);
  /* 1.4.4：界面页**不再有**主题切换按钮（以前点深色/浅色会直接掉回普通启动器） */
  const look = await js(`(() => ({ themeSeg: document.querySelectorAll('#bdSheet .bd-segbtn[data-set="theme"]').length,
      start: !!document.getElementById('bdStartPage'),
      tag: (document.querySelector('#bdSheet .bd-tag.cur') || {}).textContent || '',
      txt: document.getElementById('bdSheet').textContent }))()`);
  ok(look.themeSeg === 0, '界面页没有「切回深色 / 浅色」的按钮了', look.themeSeg + ' 个');
  ok(look.start && look.tag === '基岩版', '界面页只显示当前外观 + 启动页选项', JSON.stringify({ tag: look.tag, start: look.start }));
  ok(/实验性功能/.test(look.txt), '并写明回普通模式的唯一出口在「启动器设置 → 实验性功能」');
  await shot('bd-2d-look');

  /* 功能页：1.4.5 起整个板块移除 —— 页签和面板都不该再有 */
  const funcGone = await js(`(() => ({ tab: !!document.querySelector('#bdSheet .bd-tab[data-tab="func"]'),
      pane: !!document.querySelector('#bdSheet .bd-pane[data-pane="func"]'),
      nav: document.querySelectorAll('#bdSheet .bd-navitem').length,
      labels: Array.from(document.querySelectorAll('#bdSheet .bd-tab')).map(b => b.textContent).join('/') }))()`);
  ok(!funcGone.tab && !funcGone.pane, '设置里没有「功能」页签 / 面板了');
  ok(funcGone.labels === '通用/游戏/界面/音效/诊断/关于', '页签是 通用 / 游戏 / 界面 / 音效 / 诊断 / 关于', funcGone.labels);
  ok(funcGone.nav === 0, '那一堆页面入口也一起没了', funcGone.nav + ' 个');

  /* ---- 4b. 诊断页签（1.4.5）：内容整块借过来，逻辑还是原来那套 ---- */
  await js(`document.querySelector('#bdSheet .bd-tab[data-tab="diag"]').click()`);
  await sleep(700);
  const dg = await js(`(() => ({ pane: (document.querySelector('#bdSheet .bd-pane.on') || {}).dataset.pane,
      cards: document.querySelectorAll('#bdDiagPane .set-card').length,
      txt: document.getElementById('bdDiagPane').textContent.length,
      inst: document.querySelectorAll('#diagInstance option').length,
      left: document.querySelectorAll('#page-diag > *').length,
      dir: !!document.querySelector('#bdSheet [data-act="diagdir"]'),
      bgs: Array.from(document.querySelectorAll('#bdDiagPane .btn')).map(b => getComputedStyle(b).backgroundColor) }))()`);
  ok(dg.pane === 'diag' && dg.cards === 4 && dg.txt > 200, '「诊断」页签里四张卡都在（完整性 / 崩溃 / AI / 启动器记录）', dg.cards + ' 张 / ' + dg.txt + ' 字');
  ok(dg.left === 0, '内容是从 #page-diag 借走的（原页暂时空着，不会两处都有）', dg.left + ' 个残留');
  ok(dg.inst >= 1 && dg.dir, '实例下拉填好了，也能打开「记录目录」', dg.inst + ' 项');
  ok(dg.bgs.length >= 4 && !dg.bgs.some(x => /rgba\(0, 0, 0, 0\)/.test(x)) &&
     dg.bgs.filter(x => x === 'rgb(198, 198, 198)').length >= 2,
    '里面的按钮换成了基岩版方块材质', dg.bgs.join(' | '));
  await shot('bd-9-diag-tab');

  /* 切到别的页签：借走的内容要还回 #page-diag，否则原生诊断页会变空 */
  await js(`document.querySelector('#bdSheet .bd-tab[data-tab="about"]').click()`);
  await sleep(400);
  const dgBack = await js(`(() => ({ host: document.querySelectorAll('#bdDiagPane > *').length,
      back: document.querySelectorAll('#page-diag > *').length }))()`);
  ok(dgBack.host === 0 && dgBack.back >= 5, '切走页签，借走的诊断内容已还回 #page-diag', JSON.stringify(dgBack));

  /* ---- 4c. 关于页：只留 版本号 / 检查更新 / 打开下载页 ---- */
  const ab = await js(`(() => ({ pane: (document.querySelector('#bdSheet .bd-pane.on') || {}).dataset.pane,
      ver: (document.getElementById('bdUpdCur') || {}).textContent || '',
      chk: !!document.querySelector('#bdSheet [data-act="chkupd"]'),
      dl: !!document.querySelector('#bdSheet [data-act="opendl"]'),
      jumps: document.querySelectorAll('#bdSheet .bd-pane.on [data-go]').length,
      old: document.querySelectorAll('#bdSheet .bd-pane.on [data-act="openacc"]').length,
      txt: document.querySelector('#bdSheet .bd-pane.on').textContent }))()`);
  ok(ab.pane === 'about' && ab.ver === VERSION, '关于页显示当前版本号', ab.ver);
  ok(ab.chk && ab.dl, '关于页有「检查更新」和「打开下载页」两颗按钮');
  ok(ab.jumps === 0 && ab.old === 0 && !/完整设置/.test(ab.txt),
    '「完整设置 / 诊断 / 账户」那几颗入口按钮都撤了', ab.jumps + '/' + ab.old);

  /* 检查更新：走在没更新时的分支 */
  await js(`document.querySelector('#bdSheet [data-act="chkupd"]').click()`);
  await sleep(900);
  const up1 = await js(`(() => ({ state: document.getElementById('bdUpdStateTx').textContent,
      cls: document.getElementById('bdUpdState').className,
      out: document.getElementById('bdUpdOut').textContent }))()`);
  ok(/已是最新版本/.test(up1.state) && /已是最新版本/.test(up1.out), '点「检查更新」→ 报告已是最新', up1.state);
  ok(/ok/.test(up1.cls), '状态灯变绿（ok）', up1.cls);
  await shot('bd-9c-about');

  /* 有新版时：黄灯 + 一个「前往下载页」按钮 */
  stub['update:check'] = () => ({ ok: true, current: VERSION, latest: '9.9.9', hasUpdate: true,
    notes: '修了一堆问题', checkedAt: Date.now() });
  await js(`document.querySelector('#bdSheet [data-act="chkupd"]').click()`);
  await sleep(900);
  const up2 = await js(`(() => ({ state: document.getElementById('bdUpdStateTx').textContent,
      cls: document.getElementById('bdUpdState').className,
      go: !!document.querySelector('#bdUpdOut [data-act="opendl"]') }))()`);
  ok(/发现新版本 9.9.9/.test(up2.state) && /new/.test(up2.cls) && up2.go,
    '有新版时黄灯 + 结果里有「前往下载页」', JSON.stringify(up2));
  stub['update:check'] = () => ({ ok: true, current: VERSION, latest: VERSION, hasUpdate: false });

  /* ---- 4d. 满屏诊断页还在（侧栏「诊断」走的还是它） ---- */
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(400);
  const veil2 = await js(`(() => {
    const v = s => { const el = document.querySelector(s); return el ? getComputedStyle(el).visibility : 'missing'; };
    return { veil: document.body.classList.contains('bd-veil'), menu: v('#page-bedrock .bd-menu'), corner: v('#page-bedrock .bd-corner') };
  })()`);
  ok(!veil2.veil && veil2.menu === 'visible' && veil2.corner === 'visible',
    '关掉设置后主菜单立刻回来', JSON.stringify(veil2));
  await js(`gotoPage('diag')`);
  await sleep(900);
  const dgp = await js(`(() => ({ page: (document.querySelector('.page.active') || {}).id,
      rail: getComputedStyle(document.getElementById('rail')).display,
      cards: document.querySelectorAll('#bdDiagBody .set-card').length,
      left: document.querySelectorAll('#page-diag > *').length,
      pano: !!document.querySelector('#page-bedrock-diag .bd-pano-strip'),
      back: !!document.getElementById('bdDiagBack') }))()`);
  ok(dgp.page === 'page-bedrock-diag' && dgp.rail === 'none', '侧栏「诊断」进基岩版诊断页（侧栏收起）', JSON.stringify({ page: dgp.page, rail: dgp.rail }));
  ok(dgp.cards === 4 && dgp.left === 0 && dgp.pano && dgp.back, '四张卡搬进来了，也有全景 + 返回', dgp.cards + ' 张');
  await shot('bd-9-diag');

  await js(`document.getElementById('bdDiagBack').click()`);
  await sleep(800);
  const dgRet = await js(`(() => ({ page: (document.querySelector('.page.active') || {}).id,
      host: document.querySelectorAll('#bdDiagBody > *').length,
      back: document.querySelectorAll('#page-diag > *').length }))()`);
  ok(dgRet.page === 'page-bedrock' && dgRet.host === 0 && dgRet.back >= 5, '「返回」回主菜单，内容还回原生诊断页', JSON.stringify(dgRet));

  /* ---- 5. 社交 → 好友码：加好友 / 列表 / 移除，没有「去旧页面」的跳转 ---- */
  await js(`document.getElementById('bdSocial').click()`);
  await sleep(600);
  await js(`document.querySelectorAll('#bdSheet .bd-soc-tab')[1].click()`);
  await sleep(700);
  const fr = await js(`(() => ({ on: document.getElementById('bdRoot').classList.contains('on'),
      code: ((document.getElementById('bdFrCode') || {}).textContent || ''),
      rows: document.querySelectorAll('#bdFrList .bd-item').length,
      online: document.querySelectorAll('#bdFrList .bd-dot.on').length,
      invite: document.querySelectorAll('#bdFrList [data-invite]').length,
      del: document.querySelectorAll('#bdFrList [data-del]').length,
      jumps: document.querySelectorAll('#bdFrList [data-go]').length }))()`);
  ok(fr.on && fr.code === 'ABCD-EFGH-JKLM', '好友码来自主进程', fr.code);
  ok(fr.rows === 3 && fr.online === 0, '好友列表按在线状态显示（3 个都离线）', JSON.stringify(fr));
  ok(fr.del === 3 && fr.jumps === 0, '每行都能移除，且不再有「好友页」跳转', JSON.stringify(fr));
  await shot('bd-3-friends');
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(300);

  /* ---- 6. 切换账户弹层：列表 + 3D 模型 + 就地添加账户 ---- */
  await js(`document.getElementById('bdAccount').click()`);
  await sleep(900);
  const ac1 = await js(`(() => ({ rows: document.querySelectorAll('#bdAccList .bd-item').length,
      cur: (document.querySelector('#bdAccList .bd-tag.cur') || {}).textContent,
      switchBtns: document.querySelectorAll('#bdAccList [data-acc]').length,
      setBtns: document.querySelectorAll('#bdAccList [data-accset]').length,
      jumps: document.querySelectorAll('#bdAccList [data-go]').length,
      cv: BEDROCK.debug().model.stage }))()`);
  ok(ac1.rows === 2, '账户列表两行', ac1.rows);
  ok(ac1.cur === '当前' && ac1.switchBtns === 1, '当前账户有标记、其它行有「设为当前」', JSON.stringify(ac1));
  ok(ac1.setBtns === 2 && ac1.jumps === 0, '每行有「设置」，且没有跳旧账户页的入口', ac1.setBtns + '/' + ac1.jumps);
  ok(ac1.cv === 'big', '弹层里也挂上了 3D 模型', ac1.cv);
  await shot('bd-4-accounts');

  await js(`document.querySelectorAll('#bdAccList .bd-item')[1].click()`);
  await sleep(400);
  const acView = await js(`(() => ({ on: document.querySelectorAll('#bdAccList .bd-item.on').length,
      slim: BEDROCK.debug().slim, has: BEDROCK.debug().hasImage }))()`);
  ok(acView.on === 1 && acView.slim === true && acView.has === true, '点一行 → 右边模型换成那个账户的皮肤/模型（Alex = 苗条）', JSON.stringify(acView));

  await js(`document.querySelector('#bdSheet [data-act="addadopt"]').click()`);
  await sleep(500);
  const add = await js(`(() => ({ shown: document.getElementById('bdAccAdd').classList.contains('on'),
      inn: !!document.querySelector('#bdAccAddHost #btnAccAdd'),
      pageHas: !!document.querySelector('#page-account .set-card #btnAccAdd') }))()`);
  ok(add.shown && add.inn && !add.pageHas, '「添加账户」把账户页的表单借进弹层（离线 / 微软 / 外置都在）', JSON.stringify(add));

  await js(`document.querySelector('#bdAccList [data-acc]').click()`);
  await sleep(900);
  const ac2 = await js(`(() => ({ active: S.config.activeAccount, root: document.getElementById('bdRoot').classList.contains('on'),
      page: (document.querySelector('.page.active') || {}).id }))()`);
  ok(ac2.active === 'Alex' && ac2.root && ac2.page === 'page-bedrock', '设为当前走 account:switch，且没离开主菜单', JSON.stringify(ac2));

  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(500);
  const back1 = await js(`(() => ({ root: document.getElementById('bdRoot').classList.contains('on'),
      back: !!document.querySelector('#page-account .set-card #btnAccAdd') }))()`);
  ok(!back1.root && back1.back, '关掉弹层后「添加账户」表单回到账户页', JSON.stringify(back1));

  /* ---- 7. 更衣室弹层：大模型 + 动作，不跳账户页 ---- */
  await js(`document.getElementById('bdDress').click()`);
  await sleep(900);
  const dr = await js(`(() => ({ on: document.getElementById('bdRoot').classList.contains('on'),
      ttl: (document.querySelector('#bdSheet .bd-ttl') || {}).textContent,
      page: (document.querySelector('.page.active') || {}).id,
      cv: !!document.getElementById('bdDressCv'),
      stage: BEDROCK.debug().model.stage,
      accs: document.querySelectorAll('#bdDressAcc .bd-item').length,
      acts: document.querySelectorAll('#bdSheet .bd-chip[data-bdact]').length,
      rail: getComputedStyle(document.getElementById('rail')).display }))()`);
  ok(dr.on && dr.ttl === '更衣室' && dr.page === 'page-bedrock', '更衣室在弹层里打开（不跳账户页）', dr.page);
  ok(dr.cv && dr.stage === 'big', '更衣室里有大号 3D 模型', dr.stage);
  ok(dr.accs === 2 && dr.acts === 5, '能选账户 + 5 个动作', dr.accs + '/' + dr.acts);
  await shot('bd-6-dress');

  await js(`document.querySelector('#bdSheet .bd-chip[data-bdact="sit"]').click()`);
  await sleep(500);
  const dr2 = await js(`(() => ({ act: BEDROCK.debug().act }))()`);
  ok(dr2.act === 'sit', '动作芯片能切到坐下（点一下 duang / 点两下说话）', dr2.act);
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(400);

  /* ---- 8. 联机弹层：陶瓦控件借进来，关掉后回到联机页 ---- */
  await js(`document.getElementById('bdLan').click()`);
  await sleep(1100);
  const lan = await js(`(() => ({ on: document.getElementById('bdRoot').classList.contains('on'),
      ttl: (document.querySelector('#bdSheet .bd-ttl') || {}).textContent,
      page: (document.querySelector('.page.active') || {}).id,
      inSheet: !!document.querySelector('#bdSheet #mpBtnHost'),
      setup: !!document.querySelector('#bdSheet #mpSetup'),
      note: !!document.querySelector('#bdSheet .third-party-note'),
      pageHas: !!document.querySelector('#page-mp #mpBtnHost'),
      jumps: document.querySelectorAll('#bdSheet [data-go="mp"]').length }))()`);
  ok(lan.on && lan.ttl === '联机' && lan.page === 'page-bedrock', '联机在弹层里打开（不再跳联机页）', lan.page);
  ok(lan.inSheet && lan.setup, '陶瓦联机的建房 / 进房控件搬进了弹层', JSON.stringify(lan));
  ok(lan.note && !lan.pageHas && lan.jumps === 0, '版权标识跟着来，原页面暂时让位，且没有跳页按钮', JSON.stringify(lan));
  /* 弹层里必须同时有：联机组件卡、联机大厅卡（在 #mpMain 里）、好友联机卡、版权标识 */
  const lan3 = await js(`(() => ({ friend: Array.from(document.querySelectorAll('#bdSheet .set-card')).some(c => /好友联机/.test(c.textContent)),
      hall: !!document.querySelector('#bdSheet #mpMain .set-card'),
      cards: document.querySelectorAll('#bdSheet .set-card').length }))()`);
  ok(lan3.friend && lan3.hall && lan3.cards >= 3, '好友联机卡与大厅卡都完整搬进来了', JSON.stringify(lan3));
  await shot('bd-7-lan');
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(500);
  const lan2 = await js(`(() => ({ back: !!document.querySelector('#page-mp #mpBtnHost'),
      setupBack: !!document.querySelector('#page-mp #mpSetup'),
      root: document.getElementById('bdRoot').classList.contains('on') }))()`);
  ok(lan2.back && lan2.setupBack && !lan2.root, '关掉弹层后联机控件回到联机页（那一页还能正常用）', JSON.stringify(lan2));

  /* 1.4.8：gotoPage('mp') 在基岩版下不再是「跳到普通联机页」，而是留在主菜单 + 打开联机弹层
     （收到邀请点同意、房主的房间码到达时 renderer 都走这条路） */
  await js(`gotoPage('mp')`);
  await sleep(900);
  const mpPage = await js(`(() => ({
      page: (document.querySelector('.page.active') || {}).id,
      sheet: BEDROCK.debug().sheet,
      setup: getComputedStyle(document.getElementById('mpSetup')).display,
      card: (() => { const c = document.querySelector('#bdSheet .set-card'); return c ? getComputedStyle(c).backgroundColor : 'none'; })()
    }))()`);
  ok(mpPage.page === 'page-bedrock' && mpPage.sheet === 'lan' && mpPage.setup !== 'none',
    'gotoPage(mp) = 主菜单 + 联机弹层（未装组件显示下载卡片）', JSON.stringify(mpPage));
  ok(/^rgb\(20, 20, 20\)$/.test(mpPage.card), '联机页在基岩版下也是石质外观', mpPage.card);
  await js(`BEDROCK.close()`);
  await sleep(400);
  await js(`gotoPage('bedrock')`);
  await sleep(500);

  /* ---- 8b. 基岩版自己的下载页（主菜单「下载」不再落回普通下载页） ---- */
  await js(`gotoPage('bedrock')`);
  await sleep(400);
  await js(`document.getElementById('bdDownload').click()`);
  await sleep(900);
  const dl1 = await js(`(() => {
    const p = document.getElementById('page-bedrock-dl');
    const strip = p ? p.querySelector('.bd-pano-strip') : null;
    const bg = strip ? (getComputedStyle(strip).backgroundImage || '') : '';
    return {
      page: (document.querySelector('.page.active') || {}).id,
      has: !!p, strip: !!strip,
      tf: strip ? (strip.style.transform || '') : '',
      url: ((bg.match(/url\\("?([^")]+)"?\\)/) || [])[1] || '').split('/').slice(-1)[0],
      w: strip ? strip.offsetWidth : 0, h: strip ? strip.offsetHeight : 0,
      rail: getComputedStyle(document.getElementById('rail')).display,
      tabs: Array.from(document.querySelectorAll('#bdDlTabs .bd-segbtn')).map(b => b.textContent),
      cat: ((document.querySelector('#bdDlTabs .bd-segbtn.on') || {}).dataset || {}).cat,
      rows: document.querySelectorAll('#bdDlList .bd-item').length,
      first: ((document.querySelector('#bdDlList .bd-item .bd-item-main b') || {}).textContent || ''),
      count: (document.getElementById('bdDlCount') || {}).textContent || '',
      back: !!document.getElementById('bdDlBack'),
      btn: ((document.querySelector('#bdDlList .bd-item .bd-act .bd-btn') || {}).textContent || '')
    };
  })()`);
  ok(dl1.has && dl1.page === 'page-bedrock-dl', '主菜单「下载」进的是基岩版自己的下载页', dl1.page);
  ok(dl1.rail === 'none', '下载页同样收起侧栏（满屏铺开）', dl1.rail);
  ok(dl1.back && dl1.strip && /^panorama\.jpg$/.test(dl1.url), '顶栏有「返回」，背景是同一张全景', dl1.url);
  ok(dl1.w > dl1.h * 3.5 && /translateX/.test(dl1.tf), '这一页的背景也在转（4:1 长条横移）', dl1.w + 'x' + dl1.h + ' ' + dl1.tf);
  ok(dl1.tabs.join('/') === '正式版/快照版/远古版本/全部/MOD/整合包/资源包/光影/数据包/Java', '十个页签：版本 4 个 + 资源 5 个 + Java', dl1.tabs.join('/'));
  ok(dl1.cat === 'release', '默认停在「正式版」', dl1.cat);
  ok(dl1.rows === 3 && /^1\.21\.4/.test(dl1.first), '正式版 3 个版本，最新的顶在第一行', dl1.rows + ' 个 · ' + dl1.first);
  ok(/个版本/.test(dl1.count) && /源：/.test(dl1.count) === false, '右上角显示版本数量', dl1.count);
  const dl1b = await js(`(() => {
    const rows = Array.from(document.querySelectorAll('#bdDlList .bd-item'));
    const r = rows.find(x => !x.querySelector('.bd-tag.inst'));
    const b = r ? r.querySelector('.bd-act .bd-btn') : null;
    return { tx: b ? b.textContent : '', green: b ? b.classList.contains('bd-green') : false };
  })()`);
  ok(dl1b.tx === '安装' && dl1b.green, '没装过的行给绿色「安装」', JSON.stringify(dl1b));
  await shot('bd-8-download');
  /* 放大看一眼列表区：文字 / 按钮 / 行距在真实尺寸下是否还读得清 */
  try {
    const img = await win.webContents.capturePage({ x: 20, y: 118, width: 720, height: 180 });
    fs.writeFileSync(path.join(OUT, 'bd-8-download-zoom.png'), img.toPNG());
  } catch (_) {}

  await js(`document.querySelector('#bdDlTabs .bd-segbtn[data-cat="snapshot"]').click()`);
  await sleep(300);
  const dl2 = await js(`(() => ({ rows: document.querySelectorAll('#bdDlList .bd-item').length,
      name: ((document.querySelector('#bdDlList .bd-item .bd-item-main b') || {}).textContent || '') }))()`);
  ok(dl2.rows === 1 && /snapshot/.test(dl2.name), '切「快照版」只剩快照', dl2.rows + ' · ' + dl2.name);

  await js(`document.querySelector('#bdDlTabs .bd-segbtn[data-cat="old"]').click()`);
  await sleep(300);
  const dl3 = await js(`(() => ({ rows: document.querySelectorAll('#bdDlList .bd-item').length,
      name: ((document.querySelector('#bdDlList .bd-item .bd-item-main b') || {}).textContent || ''),
      meta: ((document.querySelector('#bdDlList .bd-item .bd-item-main span') || {}).textContent || ''),
      block: !!(document.querySelector('#bdDlList .bd-item .bd-ic img')) }))()`);
  ok(dl3.rows === 1 && /b1\.7\.3/.test(dl3.name), '切「远古版本」能翻到 b1.7.3', dl3.name);
  ok(/Beta/.test(dl3.meta) && /\d{4}-\d{2}-\d{2}/.test(dl3.meta), '每行带类型与发布日期', dl3.meta);
  ok(dl3.block, '每行前面有方块图标（跟版本页一致）');

  await js(`(() => { const i = document.getElementById('bdDlSearch'); i.value = '1.20'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await sleep(400);
  const dl4 = await js(`(() => ({ rows: document.querySelectorAll('#bdDlList .bd-item').length,
      names: Array.from(document.querySelectorAll('#bdDlList .bd-item-main b')).map(b => b.textContent.trim()) }))()`);
  ok(dl4.rows === 1 && /1\.20\.1/.test(dl4.names[0]), '搜索框能筛版本（不用切页签）', dl4.names.join(','));
  await js(`(() => { const i = document.getElementById('bdDlSearch'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await sleep(350);

  await js(`document.querySelector('#bdDlTabs .bd-segbtn[data-cat="all"]').click()`);
  await sleep(320);
  const dl5 = await js(`(() => {
    const rows = Array.from(document.querySelectorAll('#bdDlList .bd-item'));
    const pick = (re) => rows.find(x => re.test((x.querySelector('.bd-item-main b') || {}).textContent.trim()));
    const r = pick(/^1\\.21\\.4/);
    return { rows: rows.length,
      inst: r ? (r.querySelector('.bd-tag.inst') ? 'yes' : 'no') : 'missing',
      btn: r ? ((r.querySelector('.bd-act .bd-btn') || {}).textContent || '') : '',
      latest: !!pick(/^1\\.21\\.4/).querySelector('.bd-tag.cur') };
  })()`);
  ok(dl5.rows === 5, '「全部」把 5 个版本都列出来', dl5.rows + ' 个');
  ok(dl5.inst === 'yes' && dl5.btn === '再装一份', '装过的版本标「已安装」并给「再装一份」', JSON.stringify(dl5));
  ok(dl5.latest, '最新正式版带「最新」标记');

  /* 点一行 = 打开原来的安装弹窗（加载器选择 / 进度 / 取消都在） */
  await js(`(() => {
    const rows = Array.from(document.querySelectorAll('#bdDlList .bd-item'));
    const r = rows.find(x => /^1\\.20\\.1/.test((x.querySelector('.bd-item-main b') || {}).textContent.trim()));
    r.click(); return 1;
  })()`);
  await sleep(700);
  const dl6 = await js(`(() => ({ open: getComputedStyle(document.getElementById('modalMask')).display,
      txt: (document.getElementById('modalBox') || {}).textContent || '' }))()`);
  ok(dl6.open === 'flex' && /1\.20\.1/.test(dl6.txt), '点一行打开安装弹窗（选加载器 / 装）', dl6.open);
  await js(`closeModal()`);
  await sleep(500);

  await js(`document.getElementById('bdDlBack').click()`);
  await sleep(600);
  const dl7 = await js(`(() => ({ page: (document.querySelector('.page.active') || {}).id,
      rail: getComputedStyle(document.getElementById('rail')).display }))()`);
  ok(dl7.page === 'page-bedrock' && dl7.rail === 'none', '「返回」回主菜单，侧栏仍然收着', JSON.stringify(dl7));

  /* ---- 8c. 资源类页签：MOD / 整合包 / 资源包 / 光影 / 数据包 都搬进基岩版这一页 ---- */
  await js(`document.getElementById('bdDownload').click()`);
  await sleep(900);
  await js(`document.querySelector('#bdDlTabs .bd-segbtn[data-cat="mod"]').click()`);
  await sleep(900);
  const rm = await js(`(() => {
    const host = document.getElementById('bdDlRes');
    const area = document.getElementById('resArea');
    const rows = area ? Array.from(area.querySelectorAll('.ver-row')) : [];
    const btn = rows[0] ? rows[0].querySelector('.v-act .btn.primary') : null;
    return {
      page: (document.querySelector('.page.active') || {}).id,
      on: host.classList.contains('on'),
      inHost: !!(area && host.contains(area)),
      listHidden: getComputedStyle(document.getElementById('bdDlList')).display,
      ttl: (document.getElementById('bdDlTtl') || {}).textContent,
      ph: (document.getElementById('bdDlSearch') || {}).placeholder,
      rows: rows.length,
      name: rows[0] ? (rows[0].querySelector('.res-title-main') || {}).textContent : '',
      btn: btn ? btn.textContent.trim() : '',
      src: !!area.querySelector('.src-switch button'),
      sel: !!area.querySelector('#resTarget option'),
      hint: (document.getElementById('bdDlHint') || {}).textContent || '',
      ownSearch: area.querySelector('.dl-res-head .searchbox') ? getComputedStyle(area.querySelector('.dl-res-head .searchbox')).display : 'gone'
    };
  })()`);
  ok(rm.page === 'page-bedrock-dl' && rm.on && rm.inHost, '切「MOD」把完整下载页的 MOD 区块搬进这一页', JSON.stringify({ on: rm.on, inHost: rm.inHost }));
  ok(rm.listHidden === 'none', '资源页不显示版本清单', rm.listHidden);
  ok(rm.ttl === 'MOD' && /搜索 MOD/.test(rm.ph), '标题与搜索框换成 MOD 的', rm.ttl + ' / ' + rm.ph);
  ok(rm.rows >= 1 && /Sodium|钠/.test(rm.name), 'MOD 列表能搜出结果', rm.rows + ' 行 · ' + rm.name);
  ok(/安装/.test(rm.btn), '每行右侧有「安装」按钮', rm.btn);
  ok(rm.src && rm.sel, '下载源切换 + 目标版本下拉都在', JSON.stringify({ src: rm.src, sel: rm.sel }));
  ok(rm.ownSearch === 'none', '区块自带的搜索框藏起来（顶部那条统一管）', rm.ownSearch);
  ok(/mods/.test(rm.hint), '底部提示说的是 MOD 装进哪里', rm.hint);
  await shot('bd-8c-mod');
  try {
    const img = await win.webContents.capturePage({ x: 10, y: 48, width: 740, height: 240 });
    fs.writeFileSync(path.join(OUT, 'bd-8c-mod-zoom.png'), img.toPNG());
  } catch (_) {}

  /* 顶部搜索框 → 资源区（同一个查询，不重复实现搜索） */
  await js(`(() => { const i = document.getElementById('bdDlSearch'); i.value = 'jei'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await sleep(900);
  const rmq = await js(`(() => {
    const area = document.getElementById('resArea');
    return { v: (document.querySelector('#resSearch') || {}).value,
      rows: area.querySelectorAll('.ver-row').length,
      name: (area.querySelector('.res-title-main') || {}).textContent || '' };
  })()`);
  ok(rmq.v === 'jei' && rmq.rows >= 1 && /JEI/i.test(rmq.name), '在顶部搜索框打字会搜 MOD', JSON.stringify(rmq));

  /* 换页签：上一块要还回去，新的一块搬进来 */
  await js(`document.querySelector('#bdDlTabs .bd-segbtn[data-cat="shader"]').click()`);
  await sleep(900);
  const rs = await js(`(() => {
    const host = document.getElementById('bdDlRes');
    const sp = document.getElementById('spArea');
    const res = document.getElementById('resArea');
    const rows = sp ? Array.from(sp.querySelectorAll('.ver-row')) : [];
    return {
      inHost: !!(sp && host.contains(sp)),
      back: !!(res && !host.contains(res) && res.parentNode && res.parentNode.id === 'page-download'),
      backHidden: res ? getComputedStyle(res).display : '',
      resQ: (document.getElementById('bdDlSearch') || {}).value,
      ttl: (document.getElementById('bdDlTtl') || {}).textContent,
      rows: rows.length,
      name: rows[0] ? (rows[0].querySelector('.res-title-main') || {}).textContent : '',
      btn: rows[0] ? (rows[0].querySelector('.v-act .btn.primary') || {}).textContent.trim() : ''
    };
  })()`);
  ok(rs.inHost, '切「光影」换上光影那一块', String(rs.inHost));
  ok(rs.back && rs.backHidden === 'none', 'MOD 区块还回完整下载页并收起来', rs.back + '/' + rs.backHidden);
  ok(rs.resQ === '', '换分类清空搜索词（不然拿 jei 搜光影）', JSON.stringify(rs.resQ));
  ok(rs.ttl === '光影' && rs.rows >= 1 && /Complementary/.test(rs.name), '光影能搜出结果', rs.rows + ' · ' + rs.name);
  ok(/安装光影/.test(rs.btn), '光影行给「安装光影」', rs.btn);
  await shot('bd-8d-shader');

  /* 数据包：目标存档下拉（装进哪个世界的 datapacks） */
  await js(`document.querySelector('#bdDlTabs .bd-segbtn[data-cat="datapack"]').click()`);
  await sleep(900);
  const rd = await js(`(() => {
    const host = document.getElementById('bdDlRes');
    const dp = document.getElementById('dpArea');
    const sel = dp ? dp.querySelector('#dpWorld') : null;
    return {
      inHost: !!(dp && host.contains(dp)),
      worlds: sel ? Array.from(sel.options).map(o => o.value) : [],
      btn: (dp ? (dp.querySelector('.v-act .btn.primary') || {}) : {}).textContent || ''
    };
  })()`);
  ok(rd.inHost && rd.worlds.length >= 3, '数据包页有「目标存档」下拉（列出已有世界）', rd.worlds.join(' | '));
  ok(/装入选中存档/.test(rd.btn), '数据包行给「装入选中存档」', rd.btn);

  /* 整合包 / 资源包只需确认能搬进来 + 有按钮（列表结构同 MOD） */
  await js(`document.querySelector('#bdDlTabs .bd-segbtn[data-cat="modpack"]').click()`);
  await sleep(800);
  const rp = await js(`(() => {
    const host = document.getElementById('bdDlRes');
    const mp = document.getElementById('mpArea');
    return { inHost: !!(mp && host.contains(mp)), rows: mp ? mp.querySelectorAll('.ver-row').length : 0,
      btn: mp ? ((mp.querySelector('.v-act .btn.primary') || {}).textContent || '').trim() : '',
      head: mp ? (mp.querySelector('.dl-res-head') ? getComputedStyle(mp.querySelector('.dl-res-head')).display : 'gone') : '' };
  })()`);
  ok(rp.inHost && rp.rows >= 1 && /安装整合包/.test(rp.btn), '整合包页能搬进来并列出结果', JSON.stringify(rp));
  ok(rp.head === 'none', '只有搜索框的头部整条收起来（不占空位）', rp.head);
  await js(`document.querySelector('#bdDlTabs .bd-segbtn[data-cat="resourcepack"]').click()`);
  await sleep(800);
  const rr2 = await js(`(() => {
    const host = document.getElementById('bdDlRes');
    const rp = document.getElementById('rpArea');
    return { inHost: !!(rp && host.contains(rp)), rows: rp ? rp.querySelectorAll('.ver-row').length : 0,
      btn: rp ? ((rp.querySelector('.v-act .btn.primary') || {}).textContent || '').trim() : '' };
  })()`);
  ok(rr2.inHost && rr2.rows >= 1 && /安装资源包/.test(rr2.btn), '资源包页能搬进来并列出结果', JSON.stringify(rr2));

  /* 回到版本分类：资源区块要还回去，版本清单回来 */
  await js(`document.querySelector('#bdDlTabs .bd-segbtn[data-cat="release"]').click()`);
  await sleep(600);
  const rback = await js(`(() => {
    const host = document.getElementById('bdDlRes');
    const ids = ['resArea', 'mpArea', 'rpArea', 'dpArea', 'spArea'];
    return {
      on: host.classList.contains('on'),
      left: ids.filter(id => host.contains(document.getElementById(id))).length,
      home: ids.every(id => { const n = document.getElementById(id); return n && n.parentNode && n.parentNode.id === 'page-download'; }),
      list: getComputedStyle(document.getElementById('bdDlList')).display,
      rows: document.querySelectorAll('#bdDlList .bd-item').length,
      ttl: (document.getElementById('bdDlTtl') || {}).textContent
    };
  })()`);
  ok(!rback.on && rback.left === 0 && rback.home, '切回「正式版」把五块资源区全部还回完整下载页', JSON.stringify(rback));
  ok(rback.list !== 'none' && rback.rows === 3 && rback.ttl === '下载游戏', '版本清单回来了', rback.rows + ' 行 · ' + rback.ttl);

  /* 离开这一页（去主菜单）时也要还干净，免得完整下载页去操作别处的节点 */
  await js(`document.querySelector('#bdDlTabs .bd-segbtn[data-cat="mod"]').click()`);
  await sleep(700);
  await js(`document.getElementById('bdDlBack').click()`);
  await sleep(600);
  const rleave = await js(`(() => {
    const host = document.getElementById('bdDlRes');
    return { page: (document.querySelector('.page.active') || {}).id,
      empty: host.children.length === 0 && !host.classList.contains('on'),
      home: ['resArea', 'mpArea', 'rpArea', 'dpArea', 'spArea'].every(id => { const n = document.getElementById(id); return n && n.parentNode && n.parentNode.id === 'page-download'; }) };
  })()`);
  ok(rleave.page === 'page-bedrock' && rleave.empty && rleave.home, '离开下载页时资源区块原样还回去', JSON.stringify(rleave));

  /* 再进下载页：记住上次的分类（MOD），区块重新搬进来 */
  await js(`document.getElementById('bdDownload').click()`);
  await sleep(900);
  const rre = await js(`(() => {
    const host = document.getElementById('bdDlRes');
    const res = document.getElementById('resArea');
    return { cat: ((document.querySelector('#bdDlTabs .bd-segbtn.on') || {}).dataset || {}).cat,
      on: host.classList.contains('on'), inHost: !!(res && host.contains(res)) };
  })()`);
  ok(rre.cat === 'mod' && rre.on && rre.inHost, '再进来还停在 MOD，区块重新搬进来', JSON.stringify(rre));
  await js(`document.querySelector('#bdDlTabs .bd-segbtn[data-cat="release"]').click()`);
  await sleep(500);
  await js(`document.getElementById('bdDlBack').click()`);
  await sleep(500);

  /* 侧栏 / 功能页里的「下载」在基岩版下也映射到这一页 */
  await js(`document.querySelector('#railNav .rail-btn[data-page="download"]').click()`);
  await sleep(800);
  const dl8 = await js(`(document.querySelector('.page.active') || {}).id`);
  ok(dl8 === 'page-bedrock-dl', '侧栏 / 功能页点「下载」也落在基岩版下载页', dl8);

  /* 「自定义文件」= 原来那个 URL 下载弹窗（完整下载页仍留着这条路，不用切页） */
  await js(`document.getElementById('bdDlMore').click()`);
  await sleep(700);
  const dl9 = await js(`(() => ({ page: (document.querySelector('.page.active') || {}).id,
      open: getComputedStyle(document.getElementById('modalMask')).display,
      txt: (document.getElementById('modalBox') || {}).textContent || '' }))()`);
  ok(dl9.page === 'page-bedrock-dl' && dl9.open === 'flex' && /URL|链接|下载/.test(dl9.txt),
    '「自定义文件」在当前页弹 URL 下载框（不再跳走）', JSON.stringify({ page: dl9.page, open: dl9.open }));
  await js(`closeModal()`);
  await sleep(400);
  /* MOD 那些功能不再需要绕完整下载页：这条路只在用户自己想看老版式时才走 */
  await js(`gotoPage('download', { full: true })`);
  await sleep(700);
  const dl10 = await js(`(() => ({ page: (document.querySelector('.page.active') || {}).id,
      rail: getComputedStyle(document.getElementById('rail')).display,
      tabs: document.querySelectorAll('#dlTabs .tab').length,
      areas: ['resArea','mpArea','rpArea','dpArea','spArea'].every(id => document.getElementById(id).parentNode.id === 'page-download') }))()`);
  ok(dl10.page === 'page-download' && dl10.rail !== 'none', '完整下载页仍然可以进（侧栏回来）', JSON.stringify(dl10));
  ok(dl10.tabs >= 8 && dl10.areas, '完整下载页自己的 MOD / 整合包 / 光影 页签没被动过', dl10.tabs + ' 个页签');
  await js(`gotoPage('bedrock')`);
  await sleep(500);

  /* ---- 9. 没有实例时：版本下拉显示未安装，点「进入游戏」= 去下载页 ---- */
  await js(`(() => { S.installed = []; refreshHome(); return true; })()`);
  await sleep(400);
  await js(`document.getElementById('bdGame').click()`);
  await sleep(600);
  const empty = await js(`(() => ({ tx: (document.getElementById('bdPlayTx') || {}).textContent,
      ver: (((document.querySelector('#bdGameVer option') || {}).textContent) || '').trim(),
      tip: (document.getElementById('bdTip') || {}).textContent || '',
      worlds: document.querySelectorAll('#bdWorlds .bd-world').length }))()`);
  ok(/尚未安装/.test(empty.ver), '没实例时版本下拉显示「尚未安装任何版本」', empty.ver);
  ok(/下载/.test(empty.tip), '主菜单给出「去下载」的提示', empty.tip);
  await js(`document.getElementById('bdPlay').click()`);
  await sleep(800);
  const dlPage = await js(`(document.querySelector('.page.active') || {}).id`);
  ok(dlPage === 'page-bedrock-dl', '点「进入游戏」但没装版本 → 带你去基岩版下载页', dlPage);

  /* ---- 10. 切换回普通模式：左上角那个开关（1.4.5） ---- */
  await js(`gotoPage('bedrock')`);
  await sleep(400);
  const modeSw = await js(`(() => {
    const b = document.getElementById('bdMode');
    if (!b) return { has: false };
    const r = b.getBoundingClientRect();
    return { has: true, txt: b.textContent, x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), knob: !!b.querySelector('.bd-mode-sw i') };
  })()`);
  ok(modeSw.has && /普通模式/.test(modeSw.txt), '主菜单左上角有「普通模式」开关', modeSw.txt || '（没有）');
  ok(modeSw.x < 200 && modeSw.y < 120 && modeSw.w > 60, '它确实在左上角', modeSw.x + ',' + modeSw.y + ' ' + modeSw.w + 'px');
  ok(modeSw.knob, '是个开关（有滑轨和滑块）');
  await shot('bd-1c-mode-switch');

  await js(`document.getElementById('bdMode').click()`);
  await sleep(1000);
  const back = await js(`(() => ({ theme: S.config.theme, mode: document.body.classList.contains('bedrock-mode'),
      home: document.body.classList.contains('bd-home'), page: (document.querySelector('.page.active') || {}).id,
      rail: getComputedStyle(document.getElementById('rail')).display }))()`);
  ok(back.theme === 'dark' && !back.mode && !back.home, '点一下切回普通模式：body 类清干净', JSON.stringify(back));
  ok(back.page === 'page-home' && back.rail !== 'none', '回到启动器主页且侧栏正常', back.page);

  await js(`gotoPage('settings')`);
  await sleep(500);
  await js(`(() => { const g = document.getElementById('themeGrid'); if (g) g.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(400);
  const tg = await js(`(() => ({ n: document.querySelectorAll('#themeGrid .theme-opt').length,
      labels: Array.from(document.querySelectorAll('#themeGrid .theme-opt span')).map(x => x.textContent),
      active: (document.querySelector('#themeGrid .theme-opt.active') || {}).dataset.theme,
      btn: (document.getElementById('btnBedrockTheme') || {}).textContent || '' }))()`);
  ok(tg.n === 2 && !tg.labels.includes('基岩版主题'), '界面主题只剩浅色 / 深色两个', tg.labels.join(' / '));
  ok(tg.active === 'dark', '选中态跟当前主题一致', tg.active);
  ok(/开启/.test(tg.btn), '实验性功能里的开关回到「开启」', tg.btn);
  await shot('bd-5-theme-setting');

  /* ---- 10b. 实验性功能分区本身 + 开关来回 ---- */
  await js(`(() => { const g = document.getElementById('expGroup'); if (g) g.scrollIntoView({ block: 'start' }); return true; })()`);
  await sleep(420);
  const expshot = await js(`(() => {
    const c = document.getElementById('expCard');
    const b = document.getElementById('btnBedrockTheme');
    const r = c.getBoundingClientRect();
    return { visible: r.height > 80 && r.top < window.innerHeight, btn: b.textContent, tag: (c.querySelector('.exp-tag') || {}).textContent };
  })()`);
  ok(expshot.visible && expshot.tag === '实验性', '设置里有独立的「基岩版主题 · 实验性」卡片', JSON.stringify(expshot));
  await shot('bd-6-exp-setting');

  await js(`document.getElementById('btnBedrockTheme').click()`);
  await sleep(900);
  const on2 = await js(`(() => ({ theme: S.config.theme, mode: document.body.classList.contains('bedrock-mode'),
      page: (document.querySelector('.page.active') || {}).id }))()`);
  ok(on2.theme === 'bedrock' && on2.mode && on2.page === 'page-bedrock', '开关点一下就进基岩版主菜单', JSON.stringify(on2));

  await js(`document.getElementById('btnBedrockTheme').click()`);
  await sleep(900);
  const off2 = await js(`(() => ({ theme: S.config.theme, mode: document.body.classList.contains('bedrock-mode'),
      page: (document.querySelector('.page.active') || {}).id, btn: document.getElementById('btnBedrockTheme').textContent }))()`);
  ok(off2.theme === 'dark' && !off2.mode && off2.page === 'page-home', '再点一下回到深色并退回主页', JSON.stringify(off2));
  ok(/开启/.test(off2.btn), '关掉后按钮文案回到「开启」', off2.btn);

  const fails = lines.filter(l => l.startsWith('FAIL')).length;
  console.log(lines.join('\n'));
  console.log('\n[BD-JS] ' + (fails ? 'FAIL' : 'PASS') + ' · ' + lines.length + ' 项 · 失败 ' + fails);
  fs.writeFileSync(path.join(OUT, 'bedrock-result.txt'), lines.join('\n') + '\n', 'utf8');
  app.exit(fails ? 1 : 0);
}).catch(e => {
  console.error('[BD-JS] CRASH', e && e.stack || e);
  console.error('[BD-JS] 出错前执行的页面脚本：\n' + lastJs);
  app.exit(2);
});
