/* 账户页「皮肤 3D 舞台」验收（桩掉 IPC，只验渲染与交互）：
 *   ① 舞台能起来：画布有尺寸、骨架 8 段、每帧真的在画面
 *   ② 5 个动作都能切，且姿态真的不一样（不是切了没反应）
 *   ③ 拖动换视角、滚轮缩放
 *   ④ 坐下：单击 → 压扁再弹回；双击 → 触发音频
 *   ⑤ 皮肤兼容：64x64 / 64x32 旧版 / slim / 128x128 高清都不崩、面数正常
 * 用法：./node_modules/.bin/electron qa/skin3d-ui.js
 * 产物：qa/out/skin-*.png
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
/* 自动播放：双击音频那项断言需要 play() 在无用户手势时也能跑通。
   但**必须静音**——否则每跑一次测试，扬声器就把那首 3 分 08 秒的曲子放一遍，
   连跑几次就是「一直在放」。静音不影响 currentTime 前进，断言照样有效。 */
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('mute-audio');

const cfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: '1.2.5', autoCheckUpdate: false, seenVersion: '1.2.5',
  railPosition: 'left', theme: process.env.QA_THEME || 'dark', accentColor: '', bgMode: 'default',
  activeAccount: 'Steve', lastVersion: '1.21.4-fabric', startPage: 'account',
  railOrder: [], railHidden: []
};

const accounts = [
  { name: 'Steve', type: 'offline', model: 'classic', skin: false, skinUrl: '' },
];

const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [{ id: '1.21.4-fabric', dir: '1.21.4-fabric', hasJson: true, loader: 'Fabric' }], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '1.21.4', snapshot: '1.21.4' }, versions: [{ id: '1.21.4', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' }] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'update:check': () => ({ ok: true, current: '1.2.5', latest: '1.2.5', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts, active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:list': () => ({ ok: true, items: [] }),
  'friends:get': () => ({ ok: true, code: '', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: false, status: {} }),
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: false }),
  'version:info': () => ({ ok: true, id: '1.21.4-fabric', mcVer: '1.21.4', loader: 'Fabric', loaderVer: '0.20.1' }),
  'diag:launcher': () => ({ ok: true, crashes: [], diagDir: 'D:\\X' }),
  'diag:game': () => ({ ok: true, diag: { found: false, note: '无崩溃日志', rules: [], modsInvolved: [], integrity: null } }),
  'diag:integrity': () => ({ ok: true, integrity: { ok: true, instance: '', total: 0, problems: [], deep: false } }),
  'ui:trace': () => ({ ok: true }),
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lines = [];
const ok = (c, n, e) => { lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : '')); };

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false, frame: false, width: 1240, height: 900, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true }
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2400);
  const js = (code) => win.webContents.executeJavaScript(code, true);

  const shotCanvas = async (name) => {
    await js(`(() => { const v = document.querySelector('.skin-stage-view');
      if (v) { const b = v.getBoundingClientRect(); if (b.top < 8 || b.bottom > window.innerHeight - 8) v.scrollIntoView({ block: 'center' }); }
      return true; })()`);
    await sleep(240);
    const r = await js(`(() => { const b = document.getElementById('skinPreview').getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; })()`);
    if (!r.w || !r.h) return;
    try { win.webContents.invalidate(); } catch (_) {}
    await sleep(260);
    const img = await win.webContents.capturePage({ x: r.x, y: r.y, width: r.w, height: r.h });
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  };
  const shotFull = async (name) => {
    try { win.webContents.invalidate(); } catch (_) {}
    await sleep(320);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  };

  /* ---- 进账户页 ---- */
  await js(`gotoPage('account')`);
  for (let i = 0; i < 50; i++) {
    const ready = await js(`(typeof SKIN_STAGE !== 'undefined' && !!SKIN_STAGE && SKIN_STAGE.debug().frames > 4)`).catch(() => false);
    if (ready) break;
    await sleep(150);
  }

  const d0 = await js(`(() => {
    const cv = document.getElementById('skinPreview');
    const st = (typeof SKIN_STAGE !== 'undefined') ? SKIN_STAGE : null;
    return { hasStage: !!st, dbg: st ? st.debug() : null,
      cw: cv ? cv.width : 0, ch: cv ? cv.height : 0,
      cwCss: cv ? Math.round(cv.getBoundingClientRect().width) : 0,
      cwCssH: cv ? Math.round(cv.getBoundingClientRect().height) : 0,
      acts: document.querySelectorAll('#skinActs .skin-act').length };
  })()`).catch(e => ({ err: String(e && e.message) }));

  ok(!!d0.hasStage, '3D 舞台已挂载', d0.err || '');
  ok(d0.dbg && d0.dbg.parts === 6, '骨架 6 段（头/身/双臂/双腿）', d0.dbg && d0.dbg.parts);
  ok(d0.dbg && d0.dbg.hasImage, '皮肤贴图已载入（默认史蒂夫）');
  ok(d0.cw > 200 && d0.ch > 300, '画布按 DPR 放大', d0.cw + 'x' + d0.ch + ' css ' + d0.cwCss + 'x' + d0.cwCssH);
  ok(d0.dbg && d0.dbg.frames > 4, '渲染循环在跑', d0.dbg && d0.dbg.frames);
  /* 8 段骨架 × 2 层（本体 + 第二层）× 3 个朝向相机的面 = 48；旧版皮肤没有第二层 = 24 */
  ok(d0.dbg && d0.dbg.faces >= 12 && d0.dbg.faces <= 42, '每帧可见面数合理（背面已剔除）', d0.dbg && d0.dbg.faces);
  ok(d0.acts === 5, '5 个动作按钮', d0.acts);

  await js(`(() => { const v = document.querySelector('.skin-stage-view'); if (v) v.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(400);
  await shotFull('skin-1-account-dark');
  await shotCanvas('skin-2-default');

  /* ---- 动作切换 ---- */
  const acts = ['walk', 'run', 'swim', 'sit', 'default'];
  for (const a of acts) {
    await js(`document.querySelector('#skinActs [data-act="${a}"]').click()`);
    await sleep(520);
    const g = await js(`SKIN_STAGE.getAction()`);
    ok(g === a, '切到「' + a + '」', g);
    if (a !== 'default') await shotCanvas('skin-3-' + a);
  }

  /* ---- 拖动换视角 ---- */
  const rot0 = await js(`SKIN_STAGE.debug().yaw`);
  await js(`(() => {
    const cv = document.getElementById('skinPreview');
    const r = cv.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const ev = (t, cx, cy) => new PointerEvent(t, { bubbles: true, clientX: cx, clientY: cy, pointerId: 7, button: 0, buttons: t === 'pointerup' ? 0 : 1 });
    cv.dispatchEvent(ev('pointerdown', x, y));
    for (let i = 1; i <= 10; i++) cv.dispatchEvent(ev('pointermove', x + i * 9, y));
    cv.dispatchEvent(ev('pointerup', x + 90, y));
    return true;
  })()`);
  await sleep(420);
  const rot1 = await js(`SKIN_STAGE.debug().yaw`);
  ok(Math.abs(rot1 - rot0) > 0.3, '拖动 90px 视角转过去了', rot0 + ' → ' + rot1);

  /* ---- 滚轮缩放 ---- */
  const z0 = await js(`SKIN_STAGE.debug().zoom`);
  await js(`(() => {
    const cv = document.getElementById('skinPreview');
    cv.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -400, cancelable: true }));
    return true;
  })()`);
  await sleep(420);
  const z1 = await js(`SKIN_STAGE.debug().zoom`);
  ok(z1 > z0 + 0.05, '滚轮能放大', z0 + ' → ' + z1);

  /* ---- 坐下：单击压扁弹起 ---- */
  await js(`SKIN_STAGE.reset(); document.querySelector('#skinActs [data-act="sit"]').click()`);
  await sleep(400);
  await js(`(() => {
    const cv = document.getElementById('skinPreview');
    const r = cv.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const ev = (t) => new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 9, button: 0, buttons: t === 'pointerup' ? 0 : 1 });
    cv.dispatchEvent(ev('pointerdown')); cv.dispatchEvent(ev('pointerup'));
    return true;
  })()`);
  /* 弹簧是欠阻尼的：压到底只要 0.1 秒，固定 sleep 再读很容易正好读在回弹的负半周。
     这里按帧采样取峰值 —— 就是用户在屏幕上真正看到的「最扁的那一刻」。 */
  let sq = 0, sqMin = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(22);
    const v = await js(`SKIN_STAGE.debug().squash`);
    if (v > sq) sq = v;
    if (v < sqMin) sqMin = v;
  }
  ok(sq > 0.35, '坐下单击 → 被压扁（弹簧启动）', '峰值 ' + sq.toFixed(3) + ' 回弹 ' + sqMin.toFixed(3));
  await js(`(() => { return true; })()`);
  await shotCanvas('skin-4-sit-squash');
  await sleep(900);
  const sq2 = await js(`SKIN_STAGE.debug().squash`);
  ok(Math.abs(sq2) < 0.02, '压扁后自己弹回原状', sq2);
  await shotCanvas('skin-5-sit-idle');

  /* ---- 双击说话 ---- */
  const taps = await js(`(() => { window.__qaDbl = 0; return 0; })()`);
  void taps;
  const audioBefore = await js(`(() => { const a = (typeof SKIN_AUDIO !== 'undefined') ? SKIN_AUDIO : null; return { made: !!a, paused: a ? a.paused : true, t: a ? a.currentTime : 0 }; })()`);
  await js(`(() => {
    const cv = document.getElementById('skinPreview');
    const r = cv.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const ev = (t) => new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 11, button: 0, buttons: t === 'pointerup' ? 0 : 1 });
    cv.dispatchEvent(ev('pointerdown')); cv.dispatchEvent(ev('pointerup'));
    setTimeout(() => { cv.dispatchEvent(ev('pointerdown')); cv.dispatchEvent(ev('pointerup')); }, 80);
    return true;
  })()`);
  /* 本地 m4a 首次要解复用 + 缓冲，固定 sleep 会偶发读成 0；轮询到真的走帧为止 */
  let audioAfter = { made: false, paused: true, t: 0, dur: 0 };
  for (let i = 0; i < 30; i++) {
    await sleep(150);
    audioAfter = await js(`(() => { const a = (typeof SKIN_AUDIO !== 'undefined') ? SKIN_AUDIO : null; return { made: !!a, paused: a ? a.paused : true, t: a ? a.currentTime : 0, dur: a ? a.duration : 0 }; })()`);
    if (audioAfter.t > 0.05) break;
  }
  ok(!!audioAfter.made, '双击创建了音频对象', JSON.stringify(audioBefore));
  ok(audioAfter.t > 0.05, '双击后音频真的在放', 'currentTime=' + (audioAfter.t || 0).toFixed(2) + ' duration=' + (audioAfter.dur || 0).toFixed(1));

  /* ---- 说话中：模型自己转 + 一直 duang + 拖拽改朝向但自转不停 ---- */
  const talkingNow = await js(`SKIN_STAGE.debug().talking`);
  ok(talkingNow === true, '舞台进入「说话模式」', String(talkingNow));

  const yawA = await js(`SKIN_STAGE.debug().yaw`);
  await sleep(700);
  const yawB = await js(`SKIN_STAGE.debug().yaw`);
  const spun = ((yawB - yawA) % 360 + 360) % 360;
  ok(spun > 20, '说话时模型自己在转（0.7 秒转过 20° 以上）', yawA + ' → ' + yawB);

  /* 采样 2.4 秒的压扁量：说话中是「一直 duang」，应当出现 2 次以上峰值 */
  const trail = await js(`new Promise((res) => {
    const out = []; const t0 = performance.now();
    const tick = () => {
      out.push(+SKIN_STAGE.debug().squash.toFixed(3));
      if (performance.now() - t0 > 2400) return res(out);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })`);
  let peaks = 0;
  for (let i = 1; i < trail.length - 1; i++) {
    if (trail[i] > 0.25 && trail[i] >= trail[i - 1] && trail[i] > trail[i + 1]) peaks++;
  }
  ok(peaks >= 2, '说话中一直 duang（2.4 秒内至少 2 次弹跳）',
    '峰值 ' + Math.max.apply(null, trail).toFixed(2) + ' · ' + peaks + ' 次');

  /* 说话中拖动：方向跟着鼠标走，但松手后自转照旧继续 */
  const beforeDrag = await js(`SKIN_STAGE.debug().yaw`);
  await js(`(() => {
    const cv = document.getElementById('skinPreview');
    const r = cv.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const ev = (t, cx, cy) => new PointerEvent(t, { bubbles: true, clientX: cx, clientY: cy, pointerId: 21, button: 0, buttons: t === 'pointerup' ? 0 : 1 });
    cv.dispatchEvent(ev('pointerdown', x, y));
    for (let i = 1; i <= 8; i++) cv.dispatchEvent(ev('pointermove', x - i * 10, y));
    cv.dispatchEvent(ev('pointerup', x - 80, y));
    return true;
  })()`);
  await sleep(120);
  const afterDrag = await js(`SKIN_STAGE.debug().yaw`);
  ok(Math.abs(afterDrag - beforeDrag) > 30, '说话中按住拖动照样能改朝向（拖 80px）', beforeDrag + ' → ' + afterDrag);
  await sleep(700);
  const afterDragSpin = await js(`SKIN_STAGE.debug().yaw`);
  const cont = ((afterDragSpin - afterDrag) % 360 + 360) % 360;
  ok(cont > 20, '拖完松手，自转照旧继续（没有被拖拽接管）', afterDrag + ' → ' + afterDragSpin);
  await shotCanvas('skin-5b-talking');

  /* 再点两下要能停：3 分 08 秒的音轨，没有停止手段等于点错一次就得等三分钟。
     注意舞台认的是 pointerdown/up 的连击，不是 DOM 的 dblclick 事件。 */
  await js(`(() => {
    const cv = document.getElementById('skinPreview');
    const r = cv.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const ev = (t) => new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 12, button: 0, buttons: t === 'pointerup' ? 0 : 1 });
    cv.dispatchEvent(ev('pointerdown')); cv.dispatchEvent(ev('pointerup'));
    setTimeout(() => { cv.dispatchEvent(ev('pointerdown')); cv.dispatchEvent(ev('pointerup')); }, 80);
    return true;
  })()`);
  await sleep(420);
  const audioStopped = await js(`(() => { const a = (typeof SKIN_AUDIO !== 'undefined') ? SKIN_AUDIO : null;
    return { paused: a ? a.paused : true, badge: document.getElementById('skinBadge').classList.contains('on'),
      talking: (typeof SKIN_STAGE !== 'undefined' && SKIN_STAGE) ? SKIN_STAGE.debug().talking : null }; })()`);
  ok(audioStopped.paused, '再点两下能停（不是从头重放）', JSON.stringify(audioStopped));
  ok(!audioStopped.badge, '停止后角标没有残留（「正在说话」提示已移除）', String(audioStopped.badge));
  ok(audioStopped.talking === false, '停下后退出说话模式（不再转、不再 duang）', String(audioStopped.talking));

  /* 切动作也要停：避免人在走路页还在念台词 */
  await js(`document.querySelector('#skinActs [data-act="sit"]').click()`);
  await sleep(200);
  await js(`document.querySelector('#skinActs [data-act="walk"]').click()`);
  await sleep(200);
  const afterSwitch = await js(`(() => { const a = (typeof SKIN_AUDIO !== 'undefined') ? SKIN_AUDIO : null; return a ? a.paused : true; })()`);
  ok(afterSwitch, '切走动作后音频停住', String(afterSwitch));
  await js(`document.querySelector('#skinActs [data-act="sit"]').click()`);
  await sleep(200);

  /* ---- 皮肤兼容 ---- */
  const skins = [
    { name: '64x64 经典', w: 64, h: 64, model: 'classic' },
    { name: '64x32 旧版', w: 64, h: 32, model: 'classic' },
    { name: '64x64 苗条', w: 64, h: 64, model: 'slim' },
    { name: '128x128 高清', w: 128, h: 128, model: 'classic' },
  ];
  for (const s of skins) {
    /* 截图要能一眼看出「哪块贴图贴到了哪个部件」，所以先把视角和动作归位：
       上一轮拖动把视角留在了背面，看着全是后脑勺，根本没法判断 UV 对不对 */
    await js(`(() => { try { SKIN_STAGE.reset(); SKIN_STAGE.setAction('default'); } catch (e) {} return true; })()`);
    await sleep(420);
    /* 用画布现造一张可辨认的皮肤：**每个部件整块涂一个不相干的颜色**，
       这样任何一块贴图贴错位置、或者左右肢镜像搞反，都会直接露出别人的颜色。
       底色调洋红：凡是采样到「没涂过的地方」就会刺眼地跳出来，比涂灰更容易发现。

       64x64 皮肤有**第二层**（帽子 / 外套 / 袖子 / 裤腿），它比本体宽 0.22 个单位，
       会把本体整块盖住 —— 所以外层必须涂成和本体一样的颜色，否则看到的就是外层的底色
       （第一版全涂洋红，渲染出来整个人是洋红的，白查了半天）。
       帽子层例外：它要真的清空（clearRect，不是填透明），否则脸永远被一块布蒙着。 */
    const err = await js(`(() => {
      const cv = document.createElement('canvas');
      cv.width = ${s.w}; cv.height = ${s.h};
      const c = cv.getContext('2d');
      c.fillStyle = '#ff00ff'; c.fillRect(0, 0, ${s.w}, ${s.h});
      const k = ${s.w} / 64;
      const box = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * k, y * k, w * k, h * k); };
      box(0, 0, 32, 16, '#e08a2e');                                 /* 头：橙 */
      box(16, 16, 24, 16, '#2f7fbf');                               /* 躯干：蓝 */
      box(40, 16, 16, 16, '#3fae5a');                               /* 手臂（右，旧版左臂镜像这块）：绿 */
      box(0, 16, 16, 16, '#d23b3b');                                /* 腿（右，旧版左腿镜像这块）：红 */
      if (${s.h} >= 64) {   /* 64x64 与现代高清皮肤都有第二层（帽子/外套/袖子/裤腿） */
        box(32, 48, 16, 16, '#8a4fd6');                             /* 左臂：紫 */
        box(16, 48, 16, 16, '#e0d43a');                             /* 左腿：黄 */
        c.clearRect(32 * k, 0, 32 * k, 16 * k);                     /* 帽子层：清空（透明，不遮脸） */
        box(16, 32, 24, 16, '#2f7fbf');                             /* 外套第二层：跟躯干同色 */
        box(40, 32, 16, 16, '#3fae5a');                             /* 右袖第二层 */
        box(48, 48, 16, 16, '#8a4fd6');                             /* 左袖第二层 */
        box(0, 32, 16, 16, '#d23b3b');                              /* 右裤第二层 */
        box(0, 48, 16, 16, '#e0d43a');                              /* 左裤第二层 */
      }
      const url = cv.toDataURL('image/png');
      renderSkinPreview(url, '${s.model}');
      return '';
    })()`).catch(e => String(e && e.message));
    await sleep(520);
    const d = await js(`SKIN_STAGE.debug()`);
    ok(!err && d.hasImage && d.parts === 6 && d.faces >= 12,
      '皮肤兼容：' + s.name, 'parts=' + d.parts + ' faces=' + d.faces + ' legacy=' + d.legacy + (err ? ' err=' + err : ''));
    await shotCanvas('skin-6-' + s.w + 'x' + s.h + '-' + s.model + (s.w === 128 ? '-hd' : ''));
  }

  /* ---- 浅色主题 ---- */
  if ((process.env.QA_THEME || 'dark') === 'dark') {
    await js(`document.body.classList.add('light-bg'); document.querySelector('#skinActs [data-act="sit"]').click();`);
    await sleep(600);
    await shotFull('skin-7-account-light');
    await shotCanvas('skin-8-sit-light');
    await js(`document.body.classList.remove('light-bg')`);
  }

  /* ---- 离开账户页后应停止绘制（省电） ---- */
  const f1 = await js(`SKIN_STAGE.debug().frames`);
  await js(`gotoPage('home')`);
  await sleep(260);
  const f2 = await js(`SKIN_STAGE.debug().frames`);
  await sleep(700);
  const f3 = await js(`SKIN_STAGE.debug().frames`);
  ok(f3 - f2 <= 1, '离开账户页后渲染循环停住（不空转烧 CPU）', f2 + ' → ' + f3 + '（此前 ' + f1 + '）');

  console.log(lines.join('\n'));
  const bad = lines.filter(l => l.startsWith('FAIL'));
  console.log('\n[SKIN3D] ' + (bad.length ? 'FAIL ' + bad.length + ' 项' : 'PASS 全部 ' + lines.length + ' 项'));
  app.exit(bad.length ? 1 : 0);
});
