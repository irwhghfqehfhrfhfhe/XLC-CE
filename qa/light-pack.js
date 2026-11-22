/* 打包版浅色模式冒烟：确认主题色全链路生效、下载页按钮不再是深绿实心块
 * 由主进程包进 (async () => { ... })() 执行，直接写语句 + return */
const lines = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const cs = (el, p) => getComputedStyle(el).getPropertyValue(p).trim();

/* 1) 切到浅色模式 */
const lightBtn = document.querySelector('#themeGrid .theme-opt[data-theme="light"]');
if (!lightBtn) return { ok: false, lines: ['FAIL 找不到浅色模式按钮'] };
lightBtn.click();
await sleep(900);
const isLight = document.body.classList.contains('light-bg');
lines.push((isLight ? 'PASS' : 'FAIL') + ' 已切到浅色模式');

/* 2) 主按钮用实心强调色，且文字色不是白字糊白底 */
const primary = document.querySelector('#page-personal .btn.primary');
const pBg = primary ? getComputedStyle(primary).backgroundColor : '';
const pFg = primary ? getComputedStyle(primary).color : '';
lines.push('PRIMARY bg=' + pBg + ' color=' + pFg);
if (!primary || pBg === 'rgba(0, 0, 0, 0)') lines.push('FAIL 主按钮没用实心主题色');
else lines.push('PASS 主按钮为实心主题色');

/* 3) 下载页：安装按钮是浅底胶囊，不是深色实心块 */
document.querySelector('.rail-btn[data-page="download"]').click();
/* 版本清单要联网拉，等卡片真正出来（最多 15 秒） */
for (let i = 0; i < 30 && !document.querySelector('.pv-card'); i++) await sleep(500);
lines.push('INFO 版本卡片数 = ' + document.querySelectorAll('.pv-card').length);
const pv = document.querySelector('.pv-card .pv-btn');
if (!pv) {
  lines.push('FAIL 没找到版本卡上的安装按钮');
} else {
  const bg = getComputedStyle(pv).backgroundColor;
  const fg = getComputedStyle(pv).color;
  const rad = cs(pv, 'border-radius');
  lines.push('PVBTN bg=' + bg + ' color=' + fg + ' radius=' + rad);
  const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(bg);
  /* 半透明底要按白卡合成后再判断「是不是浅底」 */
  const al = m && m[4] !== undefined ? +m[4] : 1;
  const eff = m ? [(+m[1]) * al + 255 * (1 - al), (+m[2]) * al + 255 * (1 - al), (+m[3]) * al + 255 * (1 - al)] : [0, 0, 0];
  const light = (eff[0] + eff[1] + eff[2]) / 3 > 200;
  lines.push((light ? 'PASS' : 'FAIL') + ' 安装按钮是浅底胶囊');
}

/* 4) 展开面板，确认「开始安装」是实心主按钮 */
const head = document.querySelector('.pv-card .pv-head');
if (head) head.click();
await sleep(800);
const go = document.querySelector('#pvGo');
if (!go) lines.push('FAIL 面板没打开');
else {
  const bg = getComputedStyle(go).backgroundColor;
  lines.push('GO bg=' + bg + ' color=' + getComputedStyle(go).color + ' class=' + go.className);
  lines.push((bg === 'rgba(0, 0, 0, 0)' ? 'FAIL' : 'PASS') + ' 开始安装是实心按钮');
}

/* 5) 全站扫一遍：浅色下不该再有「白色半透明底」（深色主题残留） */
const bad = [];
const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
for (const el of document.querySelectorAll('body *')) {
  const st = getComputedStyle(el);
  if (st.display === 'none' || !el.getClientRects().length) continue;
  const c = parse(st.backgroundColor);
  if (c && c.a > .02 && c.a < .95 && c.r > 235 && c.g > 235 && c.b > 235) {
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    bad.push(el.tagName.toLowerCase() + cls + ' ' + st.backgroundColor);
  }
}
lines.push((bad.length ? 'FAIL' : 'PASS') + ' 浅色下无白色半透明底残留' + (bad.length ? '：' + [...new Set(bad)].slice(0, 5).join(' / ') : ''));

return { ok: !lines.some(l => l.startsWith('FAIL')), lines };
