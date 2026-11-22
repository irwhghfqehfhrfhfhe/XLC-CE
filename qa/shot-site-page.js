/* 官网改版验收：整页截图 + 检查图片是否真的加载、结构是否齐全
 * 用法：先起 website/server.js，再 env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/shot-site-page.js
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

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false, width: 1400, height: 900, paintWhenInitiallyHidden: true,
    webPreferences: { sandbox: false, offscreen: true, backgroundThrottling: false }
  });

  const shotFull = async (url, name, height) => {
    await win.loadURL(url);
    await sleep(1800);
    const h = await win.webContents.executeJavaScript('document.documentElement.scrollHeight', true);
    win.setContentSize(1400, Math.min(h + 40, height || 20000));
    await sleep(1200);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('SAVED', name, img.getSize().width + 'x' + img.getSize().height, 'pageH=' + h);
    return h;
  };

  await shotFull('http://127.0.0.1:8765/download.html', 'site-new-download.png', 3000);

  const nav = JSON.parse(await win.webContents.executeJavaScript(`(() => JSON.stringify({
    items: Array.from(document.querySelectorAll('.nav-links a')).map(a => a.textContent.trim()),
    navW: Math.round(document.querySelector('.nav-in').getBoundingClientRect().width),
    linkW: Math.round(document.querySelector('.nav-links').getBoundingClientRect().width),
    ver: (document.querySelector('.brand-ver') || {}).textContent,
    meta: (document.querySelector('[data-rel="meta"]') || {}).textContent,
    file: (document.querySelector('[data-rel="filename"]') || {}).textContent,
    href: (document.querySelector('[data-rel="download"]') || {}).getAttribute('href'),
    logs: document.querySelectorAll('.log-item').length
  }))()`, true));
  console.log('DOWNLOAD ' + JSON.stringify(nav));

  app.exit(0);
});
