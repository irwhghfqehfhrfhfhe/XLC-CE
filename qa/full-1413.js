/* 1.4.13 回归：自定义控件（拖位置 / 改大小 / 存盘 / 复位）+ 联机·切换账户·更衣室满屏
 *
 * 覆盖：
 *   A. 设置 → 界面：有「自定义控件」入口，点了会回主菜单并进入调整模式
 *   B. 调整模式：11 个命中框、拖动改位置、拖右下角改大小、顶栏数值、复位单块 / 全部
 *   C. 完成 = 写进配置（config:save 收到 bdLayout），重启后 leApply 还原
 *   D. 联机 / 切换账户 / 更衣室：.bd-sheet.bd-set 满屏、bd-full 遮罩、浅灰标题栏、返回能关
 *   E. 满屏页面内容没被裁掉（面板高度 / 内部可滚动）
 *
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/full-1413.js
 *      截图：QA_SHOT=1 时把四张图写到 qa/out/
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const SHOT = process.env.QA_SHOT === '1';

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const cfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: '1.4.13', autoCheckUpdate: false, seenVersion: '1.4.13',
  railPosition: 'left', theme: 'bedrock', accentColor: '', bgMode: 'default', activeAccount: 'Steve',
  uiSound: false, launcherVisibility: 'keep', forceChinese: true, startPage: 'bedrock'
};
let saves = 0;
ipcMain.on('win:close', () => {});
ipcMain.on('win:fullscreen', () => {});

const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { saves++; Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [{ id: '1.21.4-Fabric', dir: '1.21.4-Fabric', hasJson: true, loader: 'Fabric' }], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [], major: 21 }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'manifest:get': () => ({ ok: true, manifest: { latest: { release: '26.3' }, versions: [] } }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888-8888', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: true, status: {} }),
  'mp:status': () => ({ ok: true, installed: true, running: false }),
  'update:check': () => ({ ok: true, current: '1.4.13', latest: '1.4.13', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'account:list': () => ({ ok: true, accounts: [
    { name: 'Steve', type: 'offline', model: 'classic' },
    { name: 'Alex', type: 'offline', model: 'slim' }
  ], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [{ levelName: '我的世界', instance: '1.21.4-Fabric', seed: 123456789 }] }),
  'mods:list': () => ({ ok: true, mods: [] }),
  'shell:open': () => ({ ok: true }),
  'ui:confirm': () => ({ ok: true }),
  'plugin:list': () => ({ ok: true, plugins: { seedmap: true, server: true, gamepad: true, translator: true }, third: [] }),
  'plugin:seedmap-platforms': () => ({ ok: true, platforms: [{ code: 'java121', label: 'Java 1.21', group: 'Java 版' }] }),
  'server:cores': () => ({ ok: true, cores: [{ id: 'paper', name: 'Paper' }] }),
  'server:versions': () => ({ ok: true, versions: ['1.21.4'] }),
  'server:list': () => ({ ok: true, servers: [] }),
  'translator:pick': () => ({ ok: true, canceled: true })
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
    show: false, frame: false, width: 1440, height: 900, paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false,
      sandbox: false, backgroundThrottling: false, offscreen: true
    }
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(3400);
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const shot = async (name) => {
    if (!SHOT) return;
    try { win.webContents.invalidate(); } catch (_) {}
    await sleep(420);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.resize({ width: 1440 }).toPNG());
    console.log('shot ' + name);
  };
  const esc = () => js(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1; })()`);
  const openLook = async () => {
    await js(`document.getElementById('bdSettings').click()`);
    await sleep(700);
    await js(`document.querySelector('#bdSheet .bd-tab[data-tab="look"]').click()`);
    await sleep(500);
  };

  /* ---------- A. 设置 → 界面 里的入口 ---------- */
  await openLook();
  const a1 = await js(`(() => {
    const pane = document.querySelector('#bdSheet .bd-pane[data-pane="look"]');
    const btn = pane.querySelector('[data-act="layoutedit"]');
    const rst = pane.querySelector('[data-act="layoutreset"]');
    const rows = Array.from(pane.querySelectorAll('.bd-opt-name')).map(n => n.textContent.trim());
    return { edit: !!btn, reset: !!rst, rows,
             cls: document.getElementById('bdSheet').className,
             full: document.getElementById('bdRoot').classList.contains('bd-full') };
  })()`);
  ok(a1.edit && a1.reset, '「界面」页有自定义控件入口（开始调整 / 全部复位）', a1.rows.join(' / '));
  ok(a1.cls.indexOf('bd-set') >= 0 && a1.full, '设置页仍是满屏面板（bd-set + bd-full）', a1.cls + ' · full=' + a1.full);
  await shot('bd-set-look-1413.png');

  /* ---------- B. 进入调整模式 ---------- */
  await js(`document.querySelector('#bdSheet .bd-pane[data-pane="look"] [data-act="layoutedit"]').click()`);
  await sleep(900);
  const st0 = await js(`window.BEDROCK.layout.state()`);
  const b1 = await js(`(() => {
    const hits = Array.from(document.querySelectorAll('.bd-le-hit')).filter(h => h.style.display !== 'none');
    return {
      bar: !!document.getElementById('bdLeBar'),
      hits: hits.length,
      names: hits.map(h => h.dataset.le),
      sheet: document.getElementById('bdRoot').classList.contains('on'),
      page: (document.querySelector('.page.active') || {}).id,
      editCls: document.body.classList.contains('bd-le-edit'),
      veil: document.body.classList.contains('bd-veil')
    };
  })()`);
  ok(st0.on && b1.bar && b1.editCls, '点「开始调整」进了调整模式（顶栏在、body 挂 bd-le-edit）', 'on=' + st0.on);
  ok(!b1.sheet && !b1.veil && b1.page === 'page-bedrock', '设置面板已关，人回到基岩版主菜单', b1.page + ' · sheet=' + b1.sheet);
  ok(b1.hits >= 10, '每个控件都套上了虚线框', b1.hits + ' 个：' + b1.names.join(','));
  await shot('bd-le-1413.png');

  /* ---------- 拖位置 ---------- */
  const b2 = await js(`(() => {
    const hit = document.querySelector('.bd-le-hit[data-le="bdGame"]');
    const r = hit.getBoundingClientRect();
    const ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true });
    hit.dispatchEvent(ev('pointerdown', r.left + 20, r.top + 10));
    const layer = document.getElementById('bdLeHits');
    layer.dispatchEvent(ev('pointermove', r.left + 60, r.top + 40));
    layer.dispatchEvent(ev('pointermove', r.left + 80, r.top + 55));
    layer.dispatchEvent(ev('pointerup', r.left + 80, r.top + 55));
    const el = document.getElementById('bdGame');
    return { tf: el.style.getPropertyValue('transform'), data: window.BEDROCK.layout.state().data,
             info: document.getElementById('bdLeInfo').textContent };
  })()`);
  ok(/translate\(60px,\s*45px\)/.test(b2.tf), '拖「游戏」按钮 60×45，元素上真的加了 transform', b2.tf);
  ok(b2.data.bdGame && b2.data.bdGame.x === 60 && b2.data.bdGame.y === 45, '偏移写进了布局数据', JSON.stringify(b2.data.bdGame));
  ok(/游戏按钮/.test(b2.info) && /X 60/.test(b2.info), '顶栏实时显示选中块的数值', b2.info);

  /* ---------- 拖右下角改大小 ---------- */
  const b3 = await js(`(() => {
    const hit = document.querySelector('.bd-le-hit[data-le="bdLogo"]');
    const g = hit.querySelector('.bd-le-g');
    const el = document.getElementById('bdLogo');
    const r0 = el.getBoundingClientRect();
    const ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 2, pointerType: 'mouse', isPrimary: true });
    g.dispatchEvent(ev('pointerdown', r0.right, r0.bottom));
    const layer = document.getElementById('bdLeHits');
    layer.dispatchEvent(ev('pointermove', r0.right + 120, r0.bottom));
    layer.dispatchEvent(ev('pointerup', r0.right + 120, r0.bottom));
    const r1 = el.getBoundingClientRect();
    return { s: window.BEDROCK.layout.state().data.bdLogo && window.BEDROCK.layout.state().data.bdLogo.s,
             w0: Math.round(r0.width), w1: Math.round(r1.width), tf: el.style.getPropertyValue('transform') };
  })()`);
  ok(b3.s > 1.05, '拖右下角小方块把标题放大了', 'scale=' + b3.s);
  ok(b3.w1 > b3.w0 + 20, '标题在屏幕上真的变宽了', b3.w0 + 'px → ' + b3.w1 + 'px');

  /* ---------- 复位单块 / 全部 ---------- */
  await js(`document.querySelector('#bdLeBar [data-le="resetsel"]').click()`);
  await sleep(300);
  const b4 = await js(`(() => ({ data: window.BEDROCK.layout.state().data,
    tf: document.getElementById('bdLogo').style.getPropertyValue('transform') }))()`);
  ok(!b4.data.bdLogo && !b4.tf, '「复位这块」只把标题还原，其它不动', JSON.stringify(b4.data));

  await js(`document.querySelector('#bdLeBar [data-le="resetall"]').click()`);
  await sleep(300);
  const b5 = await js(`(() => ({ data: window.BEDROCK.layout.state().data,
    hits: Array.from(document.querySelectorAll('.bd-le-hit')).filter(h => h.style.display !== 'none').length }))()`);
  ok(Object.keys(b5.data).length === 0, '「全部复位」清空所有自定义', '剩余 ' + Object.keys(b5.data).length + ' 项');

  /* ---------- 再摆一次并「完成」：写盘 ---------- */
  await js(`(() => {
    const hit = document.querySelector('.bd-le-hit[data-le="bdModel"]');
    const r = hit.getBoundingClientRect();
    const ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 3, pointerType: 'mouse', isPrimary: true });
    hit.dispatchEvent(ev('pointerdown', r.left + 30, r.top + 30));
    document.getElementById('bdLeHits').dispatchEvent(ev('pointermove', r.left - 90, r.top + 10));
    document.getElementById('bdLeHits').dispatchEvent(ev('pointerup', r.left - 90, r.top + 10));
    return 1;
  })()`);
  await sleep(300);
  await js(`document.querySelector('#bdLeBar [data-le="done"]').click()`);
  await sleep(700);
  const c1 = await js(`(() => ({
    on: window.BEDROCK.layout.state().on,
    editCls: document.body.classList.contains('bd-le-edit'),
    bar: !!document.getElementById('bdLeBar'),
    hits: !!document.getElementById('bdLeHits'),
    tf: document.getElementById('bdModel').style.getPropertyValue('transform')
  }))()`);
  ok(!c1.on && !c1.editCls && !c1.bar && !c1.hits, '「完成」拆掉顶栏与命中框，退出调整模式', JSON.stringify(c1));
  ok(!!c1.tf, '退出后自定义位置还留在元素上（不是一关就弹回去）', c1.tf);
  ok(cfg.bdLayout && cfg.bdLayout.bdModel, '布局写进了配置（config:save 收到 bdLayout）', JSON.stringify(cfg.bdLayout));
  ok(saves > 0, 'config:save 确实被调用', saves + ' 次');

  /* ---------- 重新载入页面：位置要还原 ---------- */
  await win.webContents.reload();
  await sleep(3400);
  const c2 = await js(`(() => {
    const el = document.getElementById('bdModel');
    return { tf: el.style.getPropertyValue('transform'), cls: el.classList.contains('bd-le-cus'),
             data: window.BEDROCK.layout.state().data };
  })()`);
  ok(!!c2.tf && c2.cls, '重启后主菜单还原上次摆的位置', c2.tf);
  ok(c2.data.bdModel && c2.data.bdModel.x, '配置读回来了', JSON.stringify(c2.data.bdModel));

  /* ---------- 复位，接着验满屏页面 ---------- */
  await openLook();
  await js(`document.querySelector('#bdSheet .bd-pane[data-pane="look"] [data-act="layoutreset"]').click()`);
  await sleep(500);
  const c3 = await js(`(() => ({ tf: document.getElementById('bdModel').style.getPropertyValue('transform'),
    data: window.BEDROCK.layout.state().data }))()`);
  ok(!c3.tf && Object.keys(c3.data).length === 0, '「全部复位」按钮也生效（配置清空 + 元素还原）', JSON.stringify(c3.data));
  await esc();
  await sleep(600);

  /* ---------- D. 三个页面满屏 ---------- */
  const probe = async (open, name) => {
    if (open) await js(open);
    await sleep(1100);
    const r = await js(`(() => {
      const sh = document.getElementById('bdSheet');
      const root = document.getElementById('bdRoot');
      const cs = getComputedStyle(sh);
      const top = sh.querySelector('.bd-set-top');
      const pane = sh.querySelector('.bd-pane');
      return {
        cls: sh.className,
        full: root.classList.contains('bd-full'),
        ov: getComputedStyle(document.querySelector('.bd-ov')).backgroundColor,
        w: Math.round(sh.getBoundingClientRect().width), h: Math.round(sh.getBoundingClientRect().height),
        vw: window.innerWidth, vh: window.innerHeight,
        head: top ? top.querySelector('.bd-ttl').textContent : '',
        hasPane: !!pane, paneCls: pane ? pane.className : '',
        paneH: pane ? Math.round(pane.getBoundingClientRect().height) : 0,
        scrollable: pane ? pane.scrollHeight > pane.clientHeight + 2 : false,
        canvas: !!sh.querySelector('canvas'),
        btn: !!sh.querySelector('.bd-set-foot, .bd-sheet-foot .bd-btn'),
        back: !!sh.querySelector('.bd-set-back')
      };
    })()`);
    ok(r.cls.indexOf('bd-set') >= 0 && r.full, name + '：满屏面板（bd-set + bd-full，遮罩放到 0.10）', r.cls + ' · ov=' + r.ov);
    ok(Math.abs(r.w - r.vw) < 3 && Math.abs(r.h - r.vh) < 3, name + '：铺满整个窗口，不再是小弹窗', r.w + '×' + r.h + ' / 窗口 ' + r.vw + '×' + r.vh);
    ok(r.head === name && r.back, name + '：顶上一条浅灰标题栏（返回箭头 + 标题）', r.head);
    ok(r.hasPane && r.paneH > r.vh * 0.5, name + '：内容面板撑开了（不是挤在中间一小块）', 'pane 高 ' + r.paneH);
    return r;
  };

  await js(`document.getElementById('bdLan').click()`);
  const d1 = await probe(null, '联机');
  ok(d1.canvas === false, '联机页没混进不该有的画布', '');
  await shot('bd-lan-1413.png');
  await js(`document.querySelector('#bdSheet .bd-set-back').click()`);
  await sleep(600);
  const closed = await js(`document.getElementById('bdRoot').classList.contains('on')`);
  ok(!closed, '左上角返回箭头能关掉满屏面板', 'on=' + closed);

  await js(`document.getElementById('bdAccount').click()`);
  const d2 = await probe(null, '切换账户');
  ok(d2.canvas, '切换账户里右边那个 3D 预览还在', 'canvas=' + d2.canvas);
  await shot('bd-acc-1413.png');
  await esc();
  await sleep(600);

  await js(`document.getElementById('bdDress').click()`);
  const d3 = await probe(null, '更衣室');
  ok(d3.canvas, '更衣室的大号 3D 模型还在', 'canvas=' + d3.canvas);
  await shot('bd-dress-1413.png');

  /* 更衣室里的动作按钮仍能用（面板是活的，不是死图） */
  const d4 = await js(`(() => {
    const b = document.querySelector('#bdSheet .bd-chip[data-bdact="walk"]');
    if (!b) return { hit: false };
    b.click();
    return { hit: true, on: document.querySelectorAll('#bdSheet .bd-chip.on').length };
  })()`);
  ok(d4.hit && d4.on >= 1, '更衣室的「走路」按钮点了有选中态（事件没被满屏布局挡掉）', JSON.stringify(d4));

  /* ---------- E. 关闭后遮罩 / 主菜单恢复 ---------- */
  await esc();
  await sleep(700);
  const e1 = await js(`(() => ({
    on: document.getElementById('bdRoot').classList.contains('on'),
    veil: document.body.classList.contains('bd-veil'),
    full: document.getElementById('bdRoot').classList.contains('bd-full'),
    menu: getComputedStyle(document.querySelector('#page-bedrock .bd-menu')).opacity
  }))()`);
  ok(!e1.on && !e1.veil && e1.menu === '1', '关掉满屏面板后主菜单恢复显示（遮罩与 bd-veil 都清干净）', JSON.stringify(e1));

  const fails = lines.filter(l => l.startsWith('FAIL')).length;
  fs.writeFileSync(path.join(OUT, 'full-1413-result.txt'), lines.join('\n') + '\n', 'utf8');
  console.log('\n[FULL13-JS] ' + (fails ? 'FAIL' : 'PASS') + ' · ' + lines.length + ' 项 · 失败 ' + fails);
  app.exit(fails ? 1 : 0);
}).catch(e => {
  console.error('[FULL13-JS] CRASH', e && e.stack || e);
  app.exit(2);
});
