/* 1.4.11 回归：基岩版「插件」页签对齐普通模式 + 全屏 / 退出启动器
 *
 * 覆盖：
 *   ① 基岩版主题下标题栏整条收起（关闭 / 最小化 / 最大化 + 左上角 logo），并向主进程要全屏
 *   ② 左上角「退出启动器」→ 确认弹层 → 取消不动 / 确认才发 win:close
 *   ③ 插件页签 = 普通模式「插件」页那份数据（内置 4 + 社区 N）
 *      开关 → plugin:toggle；打开内置 → 跳到 plugins 页并 openPlugin；
 *      社区插件 → 目录 / 删除（删除前先问一遍）
 *   ④ 切回普通模式：标题栏回来、窗口退出全屏、基岩版弹层不残留
 *
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/plug-1411.js
 * 结果：qa/out/plug-1411-result.txt（stdout 有 [PLUG-JS] PASS/FAIL 汇总）
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

let plgOn = { seedmap: true, server: true, gamepad: true, translator: true, xlcdemo: true };
let third = [{
  id: 'xlcdemo', name: '示例社区插件', version: '0.3.1', author: '网友',
  description: '一个用来测卡片版式的社区插件（有独立面板）。',
  entry: 'panel.html', hasPage: true, pageTitle: '示例页', permissions: ['notify'], granted: ['notify']
}];
const calls = { toggle: [], remove: [], dir: [], fs: [], close: 0, fullscreen: [] };
ipcMain.on('win:close', () => { calls.close++; });
ipcMain.on('win:fullscreen', (_e, on) => { calls.fullscreen.push(!!on); });

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
  'saves:list': () => ({ ok: true, saves: [] }),
  'mods:list': () => ({ ok: true, mods: [] }),
  'mods:dir': () => ({ ok: true, dir: 'D:\\X\\mods' }),
  'shell:open': (_e, p) => { calls.fs.push(p); return { ok: true }; },
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'ui:confirm': () => ({ ok: true }),
  'plugin:list': () => ({ ok: true, plugins: plgOn, third }),
  'plugin:toggle': (_e, p) => { calls.toggle.push(p); plgOn[p.id] = !!p.enabled; return { ok: true, plugins: plgOn }; },
  'plugin:remove': (_e, p) => { calls.remove.push(p); third = third.filter(x => x.id !== p.id); return { ok: true }; },
  'plugin:open-dir': (_e, p) => { calls.dir.push(p); return { ok: true }; }
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

  /* ---- 1. 基岩版 = 全屏：标题栏整条收起，左上角多一颗「退出启动器」 ---- */
  const t1 = await js(`(() => {
    const tb = document.getElementById('titlebar');
    const quit = document.getElementById('bdQuit');
    const sc = tb ? getComputedStyle(tb) : null;
    const r = quit ? quit.getBoundingClientRect() : null;
    const md = document.getElementById('bdMode').getBoundingClientRect();
    const root = document.getElementById('bdRoot');
    return {
      mode: document.body.classList.contains('bedrock-mode'),
      tbDisplay: sc ? sc.display : '(none)',
      tbH: tb ? Math.round(tb.getBoundingClientRect().height) : -1,
      quit: !!quit, quitTx: quit ? quit.textContent.trim() : '',
      quitTop: r ? Math.round(r.top) : -1, quitLeft: r ? Math.round(r.left) : -1,
      modeTop: Math.round(md.top), modeLeft: Math.round(md.left),
      rootInset: getComputedStyle(root).top
    };
  })()`);
  ok(t1.mode && t1.tbDisplay === 'none' && t1.tbH === 0, '基岩版里标题栏整条收起（关闭 / 最小化 / 最大化 + logo 都不显示）', t1.tbDisplay + ' / h=' + t1.tbH);
  ok(t1.quit && /退出启动器/.test(t1.quitTx), '左上角多出「退出启动器」', t1.quitTx);
  ok(t1.quitLeft === t1.modeLeft && t1.quitTop > t1.modeTop, '它竖着排在「普通模式」开关下面', t1.quitLeft + ',' + t1.quitTop);
  ok(t1.rootInset === '0px', '弹层从屏幕顶端开始铺（不再给标题栏留 46px）', t1.rootInset);
  ok(calls.fullscreen.length > 0 && calls.fullscreen[0] === true, '进入基岩版时向主进程要了全屏', JSON.stringify(calls.fullscreen));

  /* ---- 2. 退出启动器：先确认，取消不退 ---- */
  await js(`document.getElementById('bdQuit').click()`);
  await sleep(600);
  const q1 = await js(`(() => {
    const s = document.getElementById('bdSheet');
    return {
      on: document.getElementById('bdRoot').classList.contains('on'),
      cls: s.className,
      ttl: (s.querySelector('.bd-ttl') || {}).textContent,
      body: (s.querySelector('.bd-sheet-body') || {}).textContent.slice(0, 60),
      ok: (s.querySelector('[data-act="quitnow"]') || {}).textContent,
      cancel: (s.querySelector('.bd-sheet-foot [data-close]') || {}).textContent,
      veil: document.body.classList.contains('bd-veil')
    };
  })()`);
  ok(q1.on && /bd-sm/.test(q1.cls) && q1.ttl === '退出启动器', '点「退出启动器」先弹一个小确认框', q1.ttl + ' · ' + q1.cls);
  ok(q1.ok === '退出启动器' && q1.cancel === '取消', '确认框里是「退出启动器 / 取消」', q1.ok + ' / ' + q1.cancel);
  ok(q1.veil, '确认框打开时主菜单那层隐去（只留全景）', String(q1.veil));
  await js(`document.querySelector('#bdSheet .bd-sheet-foot [data-close]').click()`);
  await sleep(500);
  ok(calls.close === 0, '点「取消」不会退出启动器', 'close 调用 ' + calls.close);

  /* ---- 3. 插件页签：内置 4 + 社区 1，跟普通模式同一套数据 ---- */
  await js(`document.getElementById('bdGame').click()`);
  await sleep(900);
  await js(`document.querySelector('#bdSheet .bd-ptab[data-ptab="addon"]').click()`);
  await sleep(800);
  const g1 = await js(`(() => {
    const cards = Array.from(document.querySelectorAll('#bdAddonList .bd-plg'));
    const first = cards[0];
    const fr = first ? first.getBoundingClientRect() : null;
    return {
      pane: (document.querySelector('#bdSheet .bd-play-pane.on') || {}).dataset.pane,
      n: cards.length,
      names: cards.map(c => c.querySelector('.bd-plg-main b').firstChild.textContent.trim()),
      tags: cards.map(c => Array.from(c.querySelectorAll('.bd-tag')).map(t => t.textContent.trim()).join('/')),
      offN: document.querySelectorAll('#bdAddonList .bd-plg.off').length,
      swOn: document.querySelectorAll('#bdAddonList .bd-sw.on').length,
      dirs: document.querySelectorAll('#bdAddonList [data-act="plugdir"]').length,
      dels: document.querySelectorAll('#bdAddonList [data-act="plugdel"]').length,
      stat: document.getElementById('bdPlugStat').textContent,
      cols: getComputedStyle(document.getElementById('bdAddonList')).gridTemplateColumns.split(' ').length,
      cardW: fr ? Math.round(fr.width) : 0,
      icons: document.querySelectorAll('#bdAddonList .bd-plg-ic').length
    };
  })()`);
  ok(g1.pane === 'addon' && g1.n === 5, '插件页列出 5 个启动器插件（内置 4 + 社区 1）', g1.n + ' 张');
  ok(g1.names.join(',') === '种子地图,一键开服,手柄控制,模组翻译器,示例社区插件', '内置在前、社区在后', g1.names.join(' | '));
  ok(g1.tags[0] === '工具/v1.0.1' && /社区/.test(g1.tags[4]), '卡片带版本号 / 标签，社区插件标「社区」', g1.tags.join(' · '));
  ok(g1.swOn === 5 && g1.offN === 0, '全部默认启用（开关都是 on）', g1.swOn + ' 个 on');
  ok(g1.dirs === 1 && g1.dels === 1, '只有社区插件才有「目录 / 删除」', g1.dirs + ' / ' + g1.dels);
  ok(/内置 4 个 · 社区 1 个/.test(g1.stat), '横线上写出内置 / 社区数量', g1.stat);
  ok(g1.cols === 2 && g1.cardW > 260, '两列卡片（跟普通模式一样的网格）', g1.cols + ' 列 · ' + g1.cardW + 'px');
  ok(g1.icons === 5, '每张卡都有图标', g1.icons);

  /* ---- 4. 开关：走 plugin:toggle，卡片变灰 ---- */
  await js(`document.querySelector('#bdAddonList .bd-plg .bd-sw').click()`);
  await sleep(700);
  const g2 = await js(`(() => ({
    off: document.querySelectorAll('#bdAddonList .bd-plg.off').length,
    st: (document.querySelector('#bdAddonList .bd-plg .bd-plg-st') || {}).textContent,
    label: (document.querySelector('#bdAddonList .bd-plg') || {}).className
  }))()`);
  ok(calls.toggle.length === 1 && calls.toggle[0].id === 'seedmap' && calls.toggle[0].enabled === false,
    '点开关真的调用 plugin:toggle（seedmap → 停用）', JSON.stringify(calls.toggle));
  ok(g2.off === 1 && g2.st === '已停用' && /off/.test(g2.label), '卡片跟着变灰并写明「已停用」', g2.st);
  /* 停用的插件「打开」按钮应该点不动 */
  const g2b = await js(`(() => {
    const c = document.querySelectorAll('#bdAddonList .bd-plg')[0];
    const b = c.querySelector('[data-act="plugopen"]');
    return { disabled: b.disabled };
  })()`);
  ok(g2b.disabled, '停用后那张卡的「打开」按钮禁用', String(g2b.disabled));
  await js(`document.querySelector('#bdAddonList .bd-plg .bd-sw').click()`);
  await sleep(600);

  /* ---- 5. 社区插件：目录 → plugin:open-dir；删除 → 先确认再 plugin:remove ---- */
  await js(`document.querySelector('#bdAddonList [data-act="plugdir"]').click()`);
  await sleep(600);
  ok(calls.dir.length === 1 && calls.dir[0].id === 'xlcdemo', '「目录」按钮打开那个插件的目录', JSON.stringify(calls.dir));
  await js(`document.querySelector('#bdAddonList [data-act="plugdel"]').click()`);
  await sleep(900);
  ok(calls.remove.length === 1 && calls.remove[0].id === 'xlcdemo', '「删除」确认后调用 plugin:remove', JSON.stringify(calls.remove));
  const g3 = await js(`(() => ({
    n: document.querySelectorAll('#bdAddonList .bd-plg').length,
    stat: document.getElementById('bdPlugStat').textContent
  }))()`);
  ok(g3.n === 4 && /社区 0 个/.test(g3.stat), '删掉以后列表与统计一起刷新', g3.n + ' 张 · ' + g3.stat);

  /* ---- 6. 打开内置插件：面板搬进弹层里，不跳普通界面 ---- */
  await js(`document.querySelector('#bdAddonList .bd-plg [data-act="plugopen"]').click()`);
  await sleep(1000);
  const g4 = await js(`(() => ({
    page: (document.querySelector('.page.active') || {}).id,
    pane: (typeof PLG !== 'undefined' && PLG.pane) || '',
    host: !!document.getElementById('bdPlgBody').querySelector('#plgSeedmap'),
    gridHidden: document.getElementById('bdAddonList').hidden,
    hostHidden: document.getElementById('bdPlgHost').hidden,
    sheet: document.getElementById('bdRoot').classList.contains('on'),
    seed: (document.getElementById('smSeed') || {}).value || '',
    ttl: (document.getElementById('bdPlgHostTtl') || {}).textContent,
    rail: getComputedStyle(document.getElementById('rail')).display
  }))()`);
  ok(g4.page === 'page-bedrock', '「打开」不再跳到普通模式插件页，人还在基岩版主菜单', g4.page);
  ok(g4.sheet, '弹层也不关（面板就地展开）', 'bdRoot.on=' + g4.sheet);
  ok(g4.host && g4.gridHidden && g4.hostHidden === false, '种子地图面板搬进弹层宿主', 'host=' + g4.host + ' / 卡片列表隐藏=' + g4.gridHidden);
  ok(g4.pane === 'seedmap' && g4.ttl === '种子地图', '面板是活的（PLG.pane=seedmap，标题对得上）', g4.pane + ' / ' + g4.ttl);
  ok(/\d{3,}/.test(g4.seed), '面板里的控件也活着（种子已自动填好）', g4.seed);
  ok(g4.rail === 'none', '基岩版里侧栏依旧收起（没有掉回普通界面）', g4.rail);

  /* ---- 6b. 点「‹ 插件列表」：面板搬回去，卡片列表回来 ---- */
  await js(`document.querySelector('#bdSheet [data-act="plugback"]').click()`);
  await sleep(700);
  const g4b = await js(`(() => ({
    host: document.getElementById('bdPlgBody').children.length,
    hostHidden: document.getElementById('bdPlgHost').hidden,
    gridHidden: document.getElementById('bdAddonList').hidden,
    back: !!document.getElementById('page-plugins').querySelector('#plgSeedmap'),
    pane: (typeof PLG !== 'undefined' && PLG.pane) || '',
    sheet: document.getElementById('bdRoot').classList.contains('on')
  }))()`);
  ok(g4b.host === 0 && g4b.hostHidden && !g4b.gridHidden, '「插件列表」把面板收起来、卡片列表回来', '宿主子节点=' + g4b.host);
  ok(g4b.back && g4b.pane === '' && g4b.sheet, '面板节点搬回了普通页面原位（普通模式插件页不会停在面板上）', 'in-page=' + g4b.back);

  /* ---- 6c. 面板自带的返回按钮（一键开服 → #btnSrvBack）也走同一套还原 ---- */
  await js(`(() => { const cs = document.querySelectorAll('#bdAddonList .bd-plg'); cs[1].querySelector('[data-act="plugopen"]').click(); })()`);
  await sleep(900);
  const g4c = await js(`(() => ({
    inHost: !!document.getElementById('bdPlgBody').querySelector('#plgServer'),
    cards: document.getElementById('bdPlgBody').querySelectorAll('.core-card').length
  }))()`);
  ok(g4c.inHost && g4c.cards >= 1, '「一键开服」也能在弹层里展开（核心卡片已渲染）', 'core=' + g4c.cards);
  await js(`document.getElementById('btnSrvBack').click()`);
  await sleep(700);
  const g4d = await js(`(() => ({
    host: document.getElementById('bdPlgBody').children.length,
    back: !!document.getElementById('page-plugins').querySelector('#plgServer'),
    gridHidden: document.getElementById('bdAddonList').hidden
  }))()`);
  ok(g4d.host === 0 && g4d.back && !g4d.gridHidden, '面板里的返回按钮也能回到插件列表', '宿主=' + g4d.host);

  /* ---- 7. 关掉弹层回主菜单：退出按钮还在 ---- */
  await js(`document.querySelector('#bdSheet [data-close]').click()`);
  await sleep(700);
  await js(`gotoPage('bedrock')`);
  await sleep(800);
  const g5 = await js(`(() => ({ page: (document.querySelector('.page.active') || {}).id,
      quit: getComputedStyle(document.getElementById('bdQuit')).visibility }))()`);
  ok(g5.page === 'page-bedrock' && g5.quit === 'visible', '回到基岩版主菜单，「退出启动器」还在', g5.page);

  /* ---- 8. 切回普通模式：标题栏回来 + 退出全屏 ---- */
  await js(`document.getElementById('bdMode').click()`);
  await sleep(1200);
  const g6 = await js(`(() => {
    const tb = document.getElementById('titlebar');
    return {
      mode: document.body.classList.contains('bedrock-mode'),
      tb: getComputedStyle(tb).display,
      tbH: Math.round(tb.getBoundingClientRect().height),
      btn: document.getElementById('btnClose') ? getComputedStyle(document.getElementById('btnClose')).display : '?'
    };
  })()`);
  ok(!g6.mode && g6.tb !== 'none' && g6.tbH >= 40, '切回普通模式：标题栏整条回来', g6.tb + ' / h=' + g6.tbH);
  ok(g6.btn !== 'none', '右上角关闭 / 最小化 / 最大化又出现了', g6.btn);
  ok(calls.fullscreen[calls.fullscreen.length - 1] === false, '同时请求退出全屏', JSON.stringify(calls.fullscreen));

  const fails = lines.filter(l => l.startsWith('FAIL')).length;
  fs.writeFileSync(path.join(OUT, 'plug-1411-result.txt'), lines.join('\n') + '\n', 'utf8');
  console.log('\n[PLUG-JS] ' + (fails ? 'FAIL' : 'PASS') + ' · ' + lines.length + ' 项 · 失败 ' + fails);
  app.exit(fails ? 1 : 0);
}).catch(e => {
  console.error('[PLUG-JS] CRASH', e && e.stack || e);
  app.exit(2);
});
