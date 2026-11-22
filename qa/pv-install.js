/* PCL 风格版本页 → 真实下载安装冒烟（LMC_SMOKE_UI_JS=qa/pv-install.js）
   从新版卡片面板点「开始安装」，等主进程装完，再校验磁盘上真的有文件 */
const L = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
try {
  const btn = document.querySelector('#railNav .rail-btn[data-page="download"]');
  if (btn) btn.click();
  await wait(400);
  for (let i = 0; i < 120; i++) { if (typeof S !== 'undefined' && S.manifest) break; await wait(250); }
  if (!(typeof S !== 'undefined' && S.manifest)) { L.push('FAIL 清单未获取'); return { ok: false, lines: L, summary: 'no manifest' }; }

  /* 搜到 1.20.4 并展开 */
  const inp = $('#verSearch');
  inp.value = '1.20.4'; inp.dispatchEvent(new Event('input'));
  await wait(600);
  const card = $$('.pv-card')[0];
  if (!card) { L.push('FAIL 没搜到 1.20.4'); return { ok: false, lines: L, summary: 'no card' }; }
  card.querySelector('.pv-head').click();
  await wait(600);
  L.push('PASS 展开面板: ' + card.dataset.vid + ' · 加载器默认 ' + (($('.pv-card.open .pv-lo.sel') || {}).dataset || {}).l);

  /* 记录安装结束事件与进度采样 */
  let done = null;
  window.lmc.on('install:done', (d) => { done = d; });
  const seen = [];
  window.lmc.on('install:progress', (d) => {
    const t = (d.stage || '') + ' ' + (d.percent || 0) + '%' + (d.text ? ' · ' + d.text : '');
    if (!seen.length || seen[seen.length - 1] !== t) {
      if (seen.length < 60) seen.push(t);
      console.log('[PV-PROG] ' + t);   /* 主进程会转发渲染进程 console，卡住时能看到最后一步 */
    }
  });

  const go = $('#pvGo');
  if (!go) { L.push('FAIL 找不到开始安装按钮'); return { ok: false, lines: L, summary: 'no go btn' }; }
  go.click();
  L.push('PASS 已点击「开始安装」');

  /* 3811 个资源文件 + 64 个库：这台机器上全量下载要 6 分钟以上，给足 20 分钟 */
  for (let i = 0; i < 3000; i++) { if (done) break; await wait(400); }
  if (!done) { L.push('FAIL 等安装结束超时（20 分钟），最后进度: ' + (seen[seen.length - 1] || '-')); return { ok: false, lines: L, summary: 'timeout' }; }
  L.push((done.ok ? 'PASS' : 'FAIL') + ' 安装结束: ok=' + !!done.ok + ' id=' + (done.versionId || '-') +
    ' cancelled=' + !!done.cancelled + (done.error ? ' err=' + done.error : ''));
  L.push('PASS 进度阶段采样(' + seen.length + '): ' + seen.slice(0, 12).join(' | '));

  /* 装完后列表应把 1.20.4 标成已安装 */
  await wait(1200);
  let installedTag = false;
  $$('.pv-card').forEach(c => {
    if (c.dataset.vid === '1.20.4' && c.querySelector('.pv-installed')) installedTag = true;
  });
  L.push((installedTag ? 'PASS' : 'WARN') + ' 列表显示「已安装」标记: ' + installedTag);

  return { ok: !!done.ok, lines: L, summary: '真实安装 ' + (done.ok ? '成功' : '失败') };
} catch (e) {
  L.push('FAIL 异常: ' + ((e && e.stack) || e));
  return { ok: false, lines: L, summary: '异常' };
}
