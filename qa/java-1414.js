/* 1.4.14 补充验收：①日期彩蛋标语 ②下载页里的 Java（基岩版独立页）
 * 用法：LMC_SMOKE_UI_JS=<abs>/qa/java-1414.js LMC_SMOKE_DATA_DIR=<临时目录> electron .
 *      打包版同理（exe 跑）。设 QA_JAVA_DL=1 会真的下一个 Java 8（慢、走网络），默认不跑。
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e === undefined ? '' : ' · ' + e));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const fails = () => lines.filter(l => l.startsWith('FAIL')).length;
const txt = (n) => ((n && n.textContent) || '').trim();
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

  /* ---------------- ① 日期彩蛋标语 ---------------- */
  const sp = document.getElementById('bdSplash');
  ok(!!sp, '标语元素在主菜单上', sp ? sp.id : 'missing');

  const t712 = window.BEDROCK.splashTestDay('7-12');
  await sleep(60);
  ok(t712 === '洛天依NB', '7-12 挂「洛天依NB」', t712);
  ok(txt(sp) === '洛天依NB', 'DOM 里也确实是这句', txt(sp));
  ok(sp.classList.contains('lock'), '命中彩蛋时带 lock 标记（点也不换）', sp.className);
  sp.click();
  await sleep(60);
  ok(txt(sp) === '洛天依NB', '锁定日点一下仍不变', txt(sp));

  /* 挂一整天：反复重绘（切主题 / 回主菜单都走 paintSplash）也不跳 */
  const seen712 = new Set();
  for (let i = 0; i < 25; i++) { window.BEDROCK.splash(); seen712.add(txt(sp)); }
  ok(seen712.size === 1 && seen712.has('洛天依NB'), '当天重绘 25 次仍是同一句（挂满一天）', Array.from(seen712).join('|'));

  const t107 = window.BEDROCK.splashTestDay('10-7');
  await sleep(60);
  ok(t107 === '社会边NB', '10-7 挂「社会边NB」', t107);
  sp.click();
  await sleep(60);
  ok(txt(sp) === '社会边NB', '10-7 同样点不动', txt(sp));

  window.BEDROCK.splashTestDay('10-8');   /* 第二天 */
  await sleep(60);
  ok(!sp.classList.contains('lock'), '第二天锁解除', sp.className);
  ok(txt(sp) !== '社会边NB' && txt(sp) !== '洛天依NB', '第二天不再挂彩蛋那句', txt(sp));

  /* 普通日子：随机表里不该再有「Java 自己下」那句 */
  const pool = new Set();
  for (let i = 0; i < 120; i++) { window.BEDROCK.splashNext(); pool.add(txt(sp)); }
  ok(pool.size >= 4, '普通日子点一下就换（随机表在转）', pool.size + ' 句');
  ok(!Array.from(pool).some(t => t.indexOf('Java 自己下') >= 0), '「Java 自己下」已从标语表删掉', Array.from(pool).filter(t => t.indexOf('Java') >= 0).join('|'));
  window.BEDROCK.splashTestDay('');
  await sleep(40);

  /* ---------------- ② 下载页 · Java ---------------- */
  const jl = await window.lmc.javaList().catch(() => null);
  const realCount = (jl && jl.javas || []).length;

  window.gotoPage('download');
  await sleep(900);
  ok(!!document.querySelector('.page.active#page-bedrock-dl'), '进到了基岩版下载页', (document.querySelector('.page.active') || {}).id);

  const tab = $('.bd-seg[data-cat], #bdDlTabs [data-cat="java"]') && $('#bdDlTabs [data-cat="java"]');
  ok(!!tab, '下载页有 Java 分类', tab ? txt(tab) : 'missing');
  tab.click();
  await sleep(1200);

  ok(!!document.querySelector('.page.active#page-bedrock-dl'), '点 Java 仍停在基岩版下载页（没跳普通页）', (document.querySelector('.page.active') || {}).id);
  const panel = $('#bdDlJava');
  ok(!!panel && panel.classList.contains('on'), 'Java 面板露出来了', panel ? panel.className : 'missing');
  ok(txt($('#bdDlTtl')) === '下载 Java', '标题变成「下载 Java」', txt($('#bdDlTtl')));
  const findBox = document.querySelector('#page-bedrock-dl .bd-dl-find');
  ok(!!findBox && getComputedStyle(findBox).display === 'none', 'Java 页藏掉搜索框（搜 Java 没意义）', findBox ? getComputedStyle(findBox).display : 'missing');
  const metaBox = document.querySelector('#page-bedrock-dl .bd-dl-meta');
  ok(!!metaBox && getComputedStyle(metaBox).display === 'none', 'Java 页藏掉下载源信息', metaBox ? getComputedStyle(metaBox).display : 'missing');
  const moreBtn = $('#bdDlMore');
  ok(!!moreBtn && getComputedStyle(moreBtn).display === 'none', 'Java 页藏掉「自定义文件」', moreBtn ? getComputedStyle(moreBtn).display : 'missing');
  ok(getComputedStyle($('#bdDlList')).display === 'none', '版本列表收起来了', getComputedStyle($('#bdDlList')).display);

  /* 列表：跟主进程 java:list 对得上 */
  const rows = $$('#bdDlJava .bd-jv-row');
  ok(rows.length === realCount, 'Java 行数 = 主进程扫到的数量', rows.length + ' / ' + realCount);
  if (realCount) {
    const paths = rows.map(r => r.dataset.jpath);
    ok(paths.every(p => !!p), '每行都带着自己的路径', paths.length + ' 行');
    ok(!!$('#bdDlJava .bd-tag.inst') || !((S.config || {}).javaPath), '当前使用的那行打了「当前」标记', (S.config || {}).javaPath || '未指定');
  } else {
    ok(!!$('#bdDlJava .bd-jv-empty'), '没 Java 时给的是空态提示（不是白板）', txt($('#bdDlJava .bd-jv-empty')).slice(0, 24));
  }

  /* 四颗下载按钮 */
  const dls = $$('#bdDlJava [data-jdl]');
  ok(dls.length === 4, '四颗下载按钮都在', dls.map(b => b.dataset.jdl).join('/'));
  ok(dls.every(b => !b.disabled), '四颗都是可点的', dls.filter(b => b.disabled).length + ' 颗禁用');
  ok(['8', '17', '21', '25'].every(v => dls.some(b => b.dataset.jdl === v)), '8 / 17 / 21 / 25 各一颗', dls.map(b => b.dataset.jdl).join(','));
  ok(dls.every(b => txt(b).indexOf('Java') === 0), '按钮上写着 Java 几', txt(dls[0]));

  /* 重新检测：真打主进程 */
  const det = $('#bdDlJava [data-jact="detect"]');
  ok(!!det, '有「重新检测」按钮', det ? txt(det) : 'missing');
  if (det) {
    det.click();
    await sleep(2500);
    ok($$('#bdDlJava .bd-jv-row').length === ((await window.lmc.javaList().catch(() => null) || {}).javas || []).length, '重新检测后列表仍对得上', $$('#bdDlJava .bd-jv-row').length);
  }

  /* 打开运行时目录：自测进程不真弹窗口，但要建好目录并回 ok */
  const od = await window.lmc.javaOpenRuntime().catch(() => null);
  ok(!!od && od.ok === true, '「打开运行时目录」接口可用（自测只建目录不弹窗）', od ? JSON.stringify(od).slice(0, 80) : 'null');

  /* 用这个 / 复制路径 */
  if (realCount) {
    const row = $$('#bdDlJava .bd-jv-row').find(r => r.dataset.jpath !== (S.config || {}).javaPath) || $$('#bdDlJava .bd-jv-row')[0];
    const want = row.dataset.jpath;
    const useBtn = row.querySelector('[data-jact="use"]');
    if (useBtn && !useBtn.disabled) {
      useBtn.click();
      await sleep(700);
      const cfgNow = await window.lmc.getConfig().catch(() => null);
      ok(!!cfgNow && cfgNow.javaPath === want, '「用这个」写进了配置（真的换默认）', (cfgNow || {}).javaPath);
      ok($('#setJavaPath').value === want, '设置页那个输入框同步了（不会被覆盖回去）', $('#setJavaPath').value);
      /* 面板会整块重绘，得重新取节点 */
      const cur = $$('#bdDlJava .bd-jv-row.cur');
      ok(cur.length === 1 && cur[0].dataset.jpath === want && !!cur[0].querySelector('.bd-tag.inst'),
        '这一行立刻标成「当前」', cur.length ? cur[0].dataset.jpath : '没有 cur 行');
    } else {
      ok(false, '「用这个」按钮应当可点', useBtn ? 'disabled' : 'missing');
    }
    const row2 = $$('#bdDlJava .bd-jv-row')[0];
    const copy = row2.querySelector('[data-jact="copy"]');
    ok(!!copy, '有「复制路径」按钮', copy ? txt(copy) : 'missing');
    if (copy) {
      while (document.querySelector('#toasts .toast')) document.querySelector('#toasts .toast').remove();
      copy.click();
      await sleep(450);
      const tst = Array.from(document.querySelectorAll('#toasts .toast')).map(txt).join('|');
      ok(tst.indexOf('路径已复制') >= 0 || tst.indexOf('复制失败') >= 0, '复制路径给了反馈（不是静默）', tst.slice(0, 60));
    }
  } else {
    ok(true, '这台机器没装 Java：跳过「用这个 / 复制路径」实测', '空态');
  }

  /* 切回正式版：面板收起、列表回来、按钮恢复 */
  $('#bdDlTabs [data-cat="release"]').click();
  await sleep(900);
  const panel2 = $('#bdDlJava');
  ok(!panel2.classList.contains('on'), '切回正式版后 Java 面板收起', panel2.className);
  ok(getComputedStyle($('#bdDlList')).display !== 'none', '版本列表回来了', getComputedStyle($('#bdDlList')).display);
  ok(getComputedStyle($('#bdDlMore')).display !== 'none', '「自定义文件」按钮回来了', getComputedStyle($('#bdDlMore')).display);
  ok(getComputedStyle(document.querySelector('#page-bedrock-dl .bd-dl-find')).display !== 'none', '搜索框回来了', 'ok');
  ok(txt($('#bdDlTtl')).indexOf('下载') === 0, '标题回到「下载游戏」', txt($('#bdDlTtl')));

  /* 可选：真下一个 Java（QA_JAVA_DL=1 才跑，走网络，慢） */
  if (window.__qaJavaDl) {
    $('#bdDlTabs [data-cat="java"]').click();
    await sleep(900);
    const before = (await window.lmc.javaList()).javas.length;
    $('#bdDlJava [data-jdl="8"]').click();
    await sleep(1500);
    ok($$('#bdDlJava [data-jdl]').every(b => b.disabled), '下载中四颗按钮都禁用（防重复点）', '');
    ok($('#bdDlJava .bd-jv-prog.on') !== null, '内嵌进度条出现', '');
    const done = await waitFor(() => !$('#bdDlJava .bd-jv-prog') || !$('#bdDlJava .bd-jv-prog').classList.contains('on'), 600000);
    const after = (await window.lmc.javaList()).javas;
    ok(done, '真下载跑完（或超时）', done ? 'finished' : 'timeout');
    ok(after.length > before, '装完列表里多了一个 Java', before + ' → ' + after.length);
  }

  const err = window.__qaErr || [];
  ok(err.length === 0, '整个过程无未捕获异常', JSON.stringify(err).slice(0, 160));
} catch (e) {
  ok(false, '脚本异常', (e && e.message) || String(e));
}

return { ok: fails() === 0, lines, summary: (fails() ? 'FAIL' : 'PASS') + ' · ' + lines.length + ' 项 · 失败 ' + fails() };
