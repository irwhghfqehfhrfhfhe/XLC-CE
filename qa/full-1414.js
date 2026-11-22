/* 1.4.14 真机冒烟（走真主进程 / 真配置 / 真 level.dat，不是 IPC 桩）：
 *   ① 主菜单黄色标语：在、是黄的、点一下换句子
 *   ② 背景随时段：bd-sky-* 类跟着配置走
 *   ③ 左下角实例角标：显示当前实例，点开是「切换版本」
 *   ④ 常驻下载进度：BEDROCK.dlBar() 推进度后条子按百分比长
 *   ⑤ 存档卡小铅笔：真改名 → 主进程回读 level.dat 确认新名字
 * 用法：LMC_SMOKE_UI_JS=qa/full-1414.js LMC_SMOKE_DATA_DIR=<临时目录> electron .
 *       （打包版同理，用 exe 跑）
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
  await waitFor(() => !document.getElementById('bootMask') || document.getElementById('bootMask').classList.contains('hide'), 20000);
  const onBl = () => document.body.classList.contains('bedrock-mode');
  if (!onBl()) {
    await window.lmc.saveConfig({ theme: 'bedrock', startPage: 'bedrock' }).catch(() => null);
    await sleep(1500);
  }
  await waitFor(() => onBl() && document.getElementById('bdGame'), 12000);
  ok(onBl(), '启动器已切到基岩版主题', document.body.className);

  /* ---------- ① 黄色标语 ---------- */
  const sp = document.getElementById('bdSplash');
  ok(!!sp, '标语元素在主菜单上', sp ? sp.id : 'missing');
  const txt = sp ? sp.textContent.trim() : '';
  ok(txt.length >= 2, '标语有文字', txt);
  const col = sp ? getComputedStyle(sp).color : '';
  ok(/rgb\(255,\s*255,\s*85\)/.test(col), '标语是基岩版那种黄 (#ffff55)', col);
  if (sp) {
    const a = sp.textContent;
    sp.click();
    await sleep(80);
    ok(sp.textContent && sp.textContent !== a, '点一下换一句', a + ' → ' + sp.textContent);
  }

  /* ---------- ② 背景随时段 ---------- */
  const skyCls = () => (document.body.className.match(/bd-sky-(\w+)/) || [])[1] || '';
  ok(!!skyCls(), 'body 上有 bd-sky-* 背景档位', skyCls());
  S.config.bdSky = 'night';
  window.BEDROCK.sky();
  await sleep(120);
  ok(skyCls() === 'night', '设成夜晚 → body 挂 bd-sky-night', skyCls());
  const nf = getComputedStyle(document.querySelector('#page-bedrock .bd-pano-strip')).filter;
  ok(/brightness\(0?\.46\)/.test(nf), '夜晚全景确实压暗了（滤镜生效）', nf.slice(0, 46));
  S.config.bdSky = 'auto';
  window.BEDROCK.sky();
  await sleep(120);
  ok(['day', 'dusk', 'night'].includes(skyCls()), '切回跟随时间仍然是合法档位', skyCls());

  /* ---------- ③ 实例角标 ---------- */
  const badge = document.getElementById('bdInst');
  const bname = document.getElementById('bdInstName');
  ok(!!badge && !!bname && bname.textContent.trim().length > 0, '左下角实例角标有文字', bname ? bname.textContent : '');
  badge.click();
  await sleep(700);
  ok(document.getElementById('bdRoot').classList.contains('on'), '点角标打开了弹层', '');
  ok(((($('#bdSheet .bd-ttl') || {}).textContent) || '') === '切换版本', '弹层标题是「切换版本」', (($('#bdSheet .bd-ttl') || {}).textContent) || '');
  const vrows = document.querySelectorAll('#bdSheet [data-pickver]').length;
  const vempty = !!$('#bdSheet .bd-empty');
  ok(vrows > 0 || vempty, '版本列表要么有行、要么有空态提示', 'rows=' + vrows + ' empty=' + vempty);
  const backBtn = $('#bdSheet [data-close]');
  if (backBtn) backBtn.click();
  await sleep(500);

  /* ---------- ④ 常驻下载进度 ---------- */
  window.BEDROCK.dlBar('资源文件 12/20', 60);
  await sleep(150);
  const bar = document.getElementById('bdDlBar');
  ok(bar && !bar.hidden, '进度条露出来了', bar ? ('hidden=' + bar.hidden) : 'missing');
  ok((document.getElementById('bdDlBarFill') || {}).style.width === '60%', '进度按 60% 长', (document.getElementById('bdDlBarFill') || {}).style.width);
  ok(((document.getElementById('bdDlBarPct') || {}).textContent) === '60%', '百分比文字对得上', (document.getElementById('bdDlBarPct') || {}).textContent);
  ok(((document.getElementById('bdDlBarTx') || {}).textContent).indexOf('资源文件') >= 0, '阶段文字透传', (document.getElementById('bdDlBarTx') || {}).textContent);

  /* ---------- ⑤ 存档卡改名（真写 level.dat） ---------- */
  const before = await window.lmc.savesList().catch(() => null);
  const s0 = before && before.ok ? (before.saves || [])[0] : null;
  ok(!!s0, '主进程能扫到测试存档', s0 ? s0.levelName : 'none');

  document.getElementById('bdGame').click();
  await sleep(1300);
  const card = document.querySelector('#bdWorlds .bd-world');
  const pencil = document.querySelector('#bdWorlds .bd-world-edit');
  ok(!!card, '游戏页有存档卡', document.querySelectorAll('#bdWorlds .bd-world').length + ' 张');
  ok(!!pencil, '存档卡名字下面有小铅笔', pencil ? pencil.textContent.trim() : 'missing');
  if (pencil) {
    ok(pencil.dataset.savename === (s0 && s0.levelName), '铅笔带着当前世界名', pencil.dataset.savename);
    pencil.click();
    await sleep(700);
    const inp = document.getElementById('bdRenameInp');
    ok(!!inp && inp.value === (s0 && s0.levelName), '改名弹层打开且预填了原名', inp ? inp.value : 'no input');
    const NEW = '改名后的世界';
    if (inp) {
      inp.value = NEW;
      const save = document.querySelector('#bdSheet [data-act="saverename"]');
      ok(!!save, '有「保存」按钮', '');
      if (save) {
        save.click();
        await sleep(1500);
        const after = await window.lmc.savesList().catch(() => null);
        const s1 = after && after.ok ? (after.saves || []).find(x => x.path === (s0 && s0.path)) : null;
        ok(!!s1 && s1.levelName === NEW, 'level.dat 里的 LevelName 真的改了', s1 ? s1.levelName : 'none');
        await sleep(600);
        const shown = document.querySelector('#bdWorlds .bd-world-meta b');
        ok(!!shown && shown.textContent === NEW, '回到游戏页后卡片显示新名字', shown ? shown.textContent : 'missing');
      }
    }
  }

  const err = window.__qaErr || [];
  ok(err.length === 0, '整个过程无未捕获异常', j(err).slice(0, 160));
} catch (e) {
  ok(false, '脚本异常', (e && e.message) || String(e));
}

return { ok: fails() === 0, lines, summary: (fails() ? 'FAIL' : 'PASS') + ' · ' + lines.length + ' 项 · 失败 ' + fails() };
