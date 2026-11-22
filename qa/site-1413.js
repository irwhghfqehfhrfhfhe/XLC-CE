/* 官网 1.4.13 改版验收：新板块排版 + 图片全部加载 + 下载页版本号 + 窄屏不溢出 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'out');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lines = [];
const ok = (c, n, e) => { lines.push((c ? 'PASS ' : 'FAIL ') + n + (e === undefined ? '' : ' · ' + e)); if (!c) console.log('FAIL ' + n + (e === undefined ? '' : ' · ' + e)); };

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, width: 1440, height: 1000, paintWhenInitiallyHidden: true,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  const js = (c) => win.webContents.executeJavaScript(c, true);
  await win.loadURL('http://127.0.0.1:8765/index.html');
  await sleep(2200);
  const info = JSON.parse(await js(`(() => {
    const imgs = Array.from(document.images);
    const sec = document.getElementById('bedrock');
    const grids = sec ? sec.querySelectorAll('.bd-grid').length : 0;
    const layoutImg = document.querySelector('img[src*="site-bd-layout"]');
    const r = layoutImg ? layoutImg.getBoundingClientRect() : null;
    return JSON.stringify({
      broken: imgs.filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src')),
      grids, hasLayout: !!layoutImg,
      lw: r ? Math.round(r.width) : 0,
      ver: (document.querySelector('.brand-ver') || {}).textContent,
      tag: (document.querySelector('.hero-tag [data-rel="version"]') || {}).textContent,
      overflow: document.documentElement.scrollWidth > innerWidth + 1
    });
  })()`));
  ok(info.broken.length === 0, '首页图片全部加载', info.broken.join(',') || '12+ 张');
  ok(info.hasLayout && info.lw > 300, '自定义控件配图在，尺寸正常', info.lw + 'px');
  ok(info.grids === 2, '基岩版专区现在有两组图文块', info.grids);
  ok(info.ver === 'v1.4.13' && info.tag === '1.4.13', '首页版本号已到 1.4.13', info.ver + ' / ' + info.tag);
  ok(!info.overflow, '1440 宽无横向溢出');

  /* 新板块单独截图 */
  const box = await js(`(() => { const s = document.getElementById('bedrock'); const g = s.querySelectorAll('.bd-grid'); const el = g[1]; const r = el.getBoundingClientRect(); return JSON.stringify({ y: Math.round(r.top + scrollY), h: Math.round(r.height) }); })()`).then(JSON.parse);
  await js(`scrollTo(0, ${box.y - 20})`);
  await sleep(600);
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1440, height: Math.min(1000, box.h + 60) });
  fs.writeFileSync(path.join(OUT, 'site-layout-sec.png'), img.toPNG());

  await win.loadURL('http://127.0.0.1:8765/download.html');
  await sleep(1600);
  const d = JSON.parse(await js(`(() => {
    const list = Array.from(document.querySelectorAll('#logList .log-item, .log-item')).map(x => (x.querySelector('.log-ver, b, h4') || {}).textContent || '');
    return JSON.stringify({
      ver: (document.querySelector('.dl-info [data-rel="version"]') || {}).textContent,
      file: (document.querySelector('[data-rel="download"]') || {}).getAttribute('href'),
      meta: (document.querySelector('[data-rel="meta"]') || {}).textContent,
      hl: Array.from(document.querySelectorAll('.dl-hl li')).map(li => li.textContent.trim().slice(0, 20)),
      logTop: list.slice(0, 3)
    });
  })()`));
  ok(d.ver === '1.4.13', '下载页版本号 1.4.13', d.ver);
  ok(/1\.4\.13-portable\.exe$/.test(d.file), '下载按钮指向 1.4.13 安装包', d.file);
  ok(/2026-11-20/.test(d.meta), '更新日期已改', d.meta);
  ok(d.hl.length >= 3, '下载页亮点写了这一版的事', d.hl.join(' | '));

  await win.loadURL('http://127.0.0.1:8765/index.html');
  await win.setContentSize(420, 900);
  await sleep(1400);
  const m = JSON.parse(await js(`(() => JSON.stringify({ overflow: document.documentElement.scrollWidth > innerWidth + 1,
    w: document.documentElement.scrollWidth, iw: innerWidth }))()`));
  ok(!m.overflow, '420 窄屏无横向溢出', m.w + '/' + m.iw);

  const fails = lines.filter(l => l.startsWith('FAIL')).length;
  for (const l of lines) console.log(l);
  console.log('\n[SITE13] ' + (fails ? 'FAIL' : 'PASS') + ' · ' + lines.length + ' 项 · 失败 ' + fails);
  app.exit(fails ? 1 : 0);
}).catch(e => { console.error('[SITE13] CRASH', e && e.stack || e); app.exit(2); });
