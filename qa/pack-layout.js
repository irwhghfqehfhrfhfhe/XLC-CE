/* 1.4.13 真机冒烟（走真主进程 / 真配置读写，不是 IPC 桩）：
 *   ① 自定义控件：开始调整 → 拖位置 → 完成 → 主进程 config:get 里真有 bdLayout
 *   ② 满屏三个页面在真实窗口里铺满，标题栏 / 返回键都在
 *   用法：LMC_SMOKE_UI_JS=qa/pack-layout.js LMC_SMOKE_DATA_DIR=<临时目录> electron .
 *        （打包版同理，用 exe 跑；详见包装脚本）
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e === undefined ? '' : ' · ' + e));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const j = (o) => JSON.stringify(o);
const fails = () => lines.filter(l => l.startsWith('FAIL')).length;

const waitFor = async (fn, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(120); }
  return false;
};

try {
  /* 等启动遮罩撤掉 + 基岩版主菜单起来 */
  await waitFor(() => !document.getElementById('bootMask') || document.getElementById('bootMask').classList.contains('hide'), 20000);
  const onBl = () => document.body.classList.contains('bedrock-mode');
  if (!onBl()) {
    const r = await window.lmc.saveConfig({ theme: 'bedrock' }).catch(() => null);
    await sleep(1500);
  }
  await waitFor(() => onBl() && document.getElementById('bdGame'), 12000);
  ok(onBl(), '启动器已切到基岩版主题', document.body.className);

  /* ---- ① 自定义控件：真拖一次，真存一次 ---- */
  window.BEDROCK.layout.start();
  await sleep(600);
  const s0 = window.BEDROCK.layout.state();
  const bar = !!document.getElementById('bdLeBar');
  const hits = Array.from(document.querySelectorAll('.bd-le-hit')).filter(h => h.style.display !== 'none').length;
  ok(s0.on && bar, '调整模式打开（顶栏在，命中框层在）', 'on=' + s0.on);
  ok(hits >= 10, '可摆的控件都套上了框', hits + ' 个');

  const drag = (id, dx, dy) => {
    const hit = document.querySelector('.bd-le-hit[data-le="' + id + '"]');
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    const ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 9, pointerType: 'mouse', isPrimary: true });
    hit.dispatchEvent(ev('pointerdown', r.left + 20, r.top + 8));
    const layer = document.getElementById('bdLeHits');
    layer.dispatchEvent(ev('pointermove', r.left + 20 + dx, r.top + 8 + dy));
    layer.dispatchEvent(ev('pointerup', r.left + 20 + dx, r.top + 8 + dy));
    return window.BEDROCK.layout.state().data[id] || null;
  };
  const v1 = drag('bdSettings', -40, 55);
  ok(v1 && v1.x === -40 && v1.y === 55, '拖动「设置」按钮 -40×55，数据跟着走', j(v1));
  ok(!!document.getElementById('bdSettings').style.getPropertyValue('transform'), '元素上真的加了 transform（看得见地挪了）');

  document.querySelector('#bdLeBar [data-le="done"]').click();
  await sleep(700);
  ok(!window.BEDROCK.layout.state().on, '「完成」退出调整模式');
  const cfgNow = await window.lmc.getConfig();
  ok(cfgNow && cfgNow.bdLayout && cfgNow.bdLayout.bdSettings,
    '主进程配置里真有 bdLayout（不是只在内存里）', j(cfgNow && cfgNow.bdLayout));
  ok(cfgNow.bdLayout.bdSettings.x === -40, '存进去的偏移跟拖的一致', j(cfgNow.bdLayout.bdSettings));

  /* ---- ② 三个满屏页面 ---- */
  const probe = async (openId, name, ms) => {
    document.getElementById(openId).click();
    await sleep(ms || 1100);
    const sh = document.getElementById('bdSheet');
    const r = sh.getBoundingClientRect();
    const info = {
      cls: sh.className,
      full: document.getElementById('bdRoot').classList.contains('bd-full'),
      w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight,
      head: (sh.querySelector('.bd-set-top .bd-ttl') || {}).textContent || '',
      back: !!sh.querySelector('.bd-set-back'),
      pane: !!sh.querySelector('.bd-pane.on')
    };
    ok(info.cls.indexOf('bd-set') >= 0, name + '：用的是设置页那套满屏骨架', info.cls);
    ok(Math.abs(info.w - info.vw) < 3 && Math.abs(info.h - info.vh) < 3, name + '：铺满窗口', info.w + '×' + info.h + ' / ' + info.vw + '×' + info.vh);
    ok(info.full, name + '：遮罩放到最透（bd-full）', 'full=' + info.full);
    ok(info.head === name && info.back && info.pane, name + '：标题栏 + 返回箭头 + 内容面板都在', info.head);
    const back = sh.querySelector('.bd-set-back');
    if (back) back.click();
    await sleep(600);
    ok(!document.getElementById('bdRoot').classList.contains('on'), name + '：返回键能关掉', '');
  };
  await probe('bdLan', '联机');
  await probe('bdAccount', '切换账户', 1300);
  await probe('bdDress', '更衣室', 1300);

  /* ---- 收尾：布局复位，别把测试摆位留给下一轮 ---- */
  window.BEDROCK.layout.reset();
  await sleep(500);
  ok(!document.getElementById('bdSettings').style.getPropertyValue('transform'), '复位后元素回到原位', '');
} catch (e) {
  ok(false, '脚本异常', (e && e.message) || String(e));
}

return { ok: fails() === 0, lines, summary: (fails() ? 'FAIL' : 'PASS') + ' · ' + lines.length + ' 项 · 失败 ' + fails() };
