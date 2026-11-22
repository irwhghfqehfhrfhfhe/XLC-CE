/* 官网改版交互验收：图片放大层 + 窄屏响应式
 * 用法：先起 website/server.js，再 env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/verify-site.js
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'out');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('in-process-gpu');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lines = [];
const ok = (c, n, e) => { lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : '')); };

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false, width: 1400, height: 1000, paintWhenInitiallyHidden: true,
    webPreferences: { sandbox: false, offscreen: true, backgroundThrottling: false }
  });
  const js = (c) => win.webContents.executeJavaScript(c, true);
  const shot = async (name) => {
    fs.writeFileSync(path.join(OUT, name), (await win.webContents.capturePage()).toPNG());
    console.log('SAVED ' + name);
  };

  /* ---------- 桌面：放大层 ---------- */
  await win.loadURL('http://127.0.0.1:8765/index.html');
  await sleep(2000);
  await js(`document.querySelector('#shots').scrollIntoView({block:'center'}); 1`);
  await sleep(900);
  const clicked = await js(`(() => {
    const img = document.querySelector('#shots .shot img');
    if (!img) return 'NO-IMG';
    img.click();
    const lb = document.getElementById('lb');
    return JSON.stringify({
      on: lb.classList.contains('on'),
      src: (lb.querySelector('img').getAttribute('src') || '').slice(-28),
      dim: lb.querySelector('img').naturalWidth,
      bodyLock: document.body.style.overflow
    });
  })()`);
  console.log('LIGHTBOX ' + clicked);
  ok(/"on":true/.test(clicked), '点击截图打开放大层');
  ok(/"dim":1440/.test(clicked), '放大层载入原图（1440 宽）');
  await sleep(700);
  await shot('site-lb-open.png');

  const closed = await js(`(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const lb = document.getElementById('lb');
    return JSON.stringify({ on: lb.classList.contains('on'), bodyLock: document.body.style.overflow });
  })()`);
  console.log('ESC ' + closed);
  ok(/"on":false/.test(closed), 'Esc 关闭放大层');
  ok(/"bodyLock":""/.test(closed), '关闭后恢复页面滚动');

  /* ---------- 结构 & 图片 ---------- */
  /* 先把整页滚一遍，让 loading="lazy" 的图都真正发起加载 */
  await js(`(async () => {
    const H = document.body.scrollHeight;
    for (let y = 0; y <= H; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 1200));
    return 1;
  })()`);
  await sleep(1600);
  const info = JSON.parse(await js(`(() => {
    const imgs = Array.from(document.images).filter(i => i.getAttribute('src'));
    return JSON.stringify({
      broken: imgs.filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src')),
      total: imgs.length,
      feats: document.querySelectorAll('.feat').length,
      faqs: document.querySelectorAll('.faq').length,
      groups: document.querySelectorAll('.faq-group').length,
      h1: (document.querySelector('.hero h1') || {}).innerText,
      navItems: Array.from(document.querySelectorAll('.nav-links a')).map(a => a.textContent.trim()),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1
    });
  })()`));
  console.log('INFO ' + JSON.stringify(info));
  ok(info.broken.length === 0, '图片全部加载', info.total + ' 张');
  ok(info.feats === 9, '功能卡片 9 张');
  ok(info.faqs === 11 && info.groups === 2, 'FAQ 11 条 / 2 组');
  ok(!info.overflowX, '桌面无横向溢出');

  /* ---------- FAQ 展开态 ---------- */
  const faqOpen = JSON.parse(await js(`(() => {
    const items = Array.from(document.querySelectorAll('.faq'));
    items.slice(0, 3).forEach(d => d.open = true);
    const first = items[0];
    document.getElementById('faq').scrollIntoView({ block: 'start' });
    return JSON.stringify({
      openCount: document.querySelectorAll('.faq[open]').length,
      pOverflow: Array.from(first.querySelectorAll('p')).some(p => p.scrollWidth > p.clientWidth + 1),
      h: Math.round(first.getBoundingClientRect().height)
    });
  })()`));
  console.log('FAQ-OPEN ' + JSON.stringify(faqOpen));
  ok(faqOpen.openCount === 3, 'FAQ 可展开');
  ok(!faqOpen.pOverflow, 'FAQ 展开后文字不溢出');
  await sleep(900);
  await shot('site-faq-open.png');
  await js(`document.querySelectorAll('.faq').forEach(d => d.open = false); 1`);

  /* ---------- 窄屏 ---------- */
  win.setContentSize(420, 900);
  await sleep(600);
  await win.loadURL('http://127.0.0.1:8765/index.html');
  await sleep(1800);
  await js(`window.scrollTo(0, 0); 1`);
  await sleep(500);
  const mob = JSON.parse(await js(`(() => JSON.stringify({
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    shotCols: getComputedStyle(document.querySelector('.shot-grid') || document.body).gridTemplateColumns,
    navHidden: getComputedStyle(document.querySelector('.nav-links a:not(.nav-cta)')).display,
    h1: (document.querySelector('.hero h1') || {}).innerText,
    heroCols: getComputedStyle(document.querySelector('.hero-in')).gridTemplateColumns
  }))()`));
  console.log('MOBILE ' + JSON.stringify(mob));
  ok(!mob.overflowX, '窄屏无横向溢出');
  ok(mob.heroCols.split(' ').length === 1, '窄屏 hero 变单列');
  ok(mob.navHidden === 'none', '窄屏隐藏次要导航');
  await shot('site-mobile-top.png');
  await js(`document.getElementById('faq').scrollIntoView({block:'start'}); 1`);
  await sleep(900);
  await shot('site-mobile-faq.png');

  fs.writeFileSync(path.join(OUT, 'verify-site.log'), lines.join('\n') + '\n', 'utf8');
  console.log('\n' + lines.join('\n'));
  app.exit(0);
});
