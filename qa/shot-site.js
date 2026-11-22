/* 官网视觉验收：截图 + 校验版本信息是否跟着 release.json 走
 * 用法：先起 website/server.js（127.0.0.1:8765），再 ./node_modules/.bin/electron qa/shot-site.js
 */
const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs');
const OUT = path.join(__dirname, 'out');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('in-process-gpu');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: true, width: 1400, height: 980, webPreferences: { sandbox: false } });
  const lines = [];
  const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
    console.log('SAVED', name);
  };

  /* ---- 下载页 ---- */
  await win.loadURL('http://127.0.0.1:8765/download.html');
  await sleep(1600);
  await win.webContents.executeJavaScript('window.scrollTo(0,0)');
  await sleep(300);

  const info = JSON.parse(await win.webContents.executeJavaScript(`(() => JSON.stringify({
    ver: (document.querySelector('[data-rel="version"]') || {}).textContent,
    meta: (document.querySelector('[data-rel="meta"]') || {}).textContent,
    fname: (document.querySelector('[data-rel="filename"]') || {}).textContent,
    href: (document.querySelector('[data-rel="download"]') || {}).getAttribute ? document.querySelector('[data-rel="download"]').getAttribute('href') : '',
    logCount: document.querySelectorAll('.log-item').length,
    logFirst: (document.querySelector('.log-item .log-ver') || {}).textContent,
    logHl: document.querySelectorAll('.log-item.latest .log-hl li').length,
    vers: Array.from(document.querySelectorAll('.log-ver')).map(x => x.textContent).join(','),
    navHas: /更新日志/.test(document.querySelector('.nav-links') ? document.querySelector('.nav-links').textContent : ''),
    logH: Math.round((document.getElementById('changelog') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height)
  }))()`));

  ok(info.ver === '1.2.1', '下载卡片版本号是 1.2.1', info.ver);
  ok(/2026-11-07/.test(info.meta || ''), '更新日期已刷新', info.meta);
  ok(/1\.2\.1-portable\.exe/.test(info.fname || ''), '安装说明文件名同步', info.fname);
  ok(/1\.2\.1-portable\.exe$/.test(info.href || ''), '下载按钮指向新文件', info.href);
  ok(info.navHas, '导航有「更新日志」入口');
  ok(info.logCount === 2, '更新日志 2 条（1.2.1 / 1.2.0）', info.logCount);
  ok(info.logFirst === 'v1.2.1', '最新一条是 v1.2.1', info.logFirst);
  ok(info.logHl >= 5, '最新版列出修复要点', info.logHl);
  ok(info.vers === 'v1.2.1,v1.2.0', '版本列表顺序正确且不重复', info.vers);
  ok(info.logH > 200, '更新日志区块有实际高度', info.logH + 'px');

  await shot('site-download');

  await win.webContents.executeJavaScript(`document.getElementById('changelog').scrollIntoView({block:'start'}); true`);
  await sleep(900);
  await shot('site-changelog');

  /* ---- 首页 ---- */
  await win.loadURL('http://127.0.0.1:8765/index.html');
  await sleep(1400);
  const home = JSON.parse(await win.webContents.executeJavaScript(`(() => JSON.stringify({
    brand: (document.querySelector('.brand-ver') || {}).textContent,
    size: (document.querySelector('[data-rel="sizeonly"]') || {}).textContent,
    tag: (document.querySelector('.hero-tag') || {}).textContent
  }))()`));
  ok(home.brand === '1.2.1', '首页徽标 1.2.1', home.brand);
  ok(/\d+\s?MB/.test(home.size || ''), '首页体积自动填充', home.size);
  ok(/1\.2\.1/.test(home.tag || ''), '首屏标签写明 1.2.1', home.tag);
  await shot('site-home');

  console.log(lines.join('\n'));
  const bad = lines.filter(l => l.startsWith('FAIL')).length;
  console.log(bad ? ('__HAS_FAIL__ ' + bad) : '__ALL_PASS__');
  app.exit(bad ? 1 : 0);
}).catch(e => { console.error('ERR', e && e.stack || e); app.exit(2); });
