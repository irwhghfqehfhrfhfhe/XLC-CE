/* 官网改版分区截图（整页图太大，按区块截）
 * 用法：先起 website/server.js，再 env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/shot-site-sections.js
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
    show: false, width: 1400, height: 1100, paintWhenInitiallyHidden: true,
    webPreferences: { sandbox: false, offscreen: true, backgroundThrottling: false }
  });
  await win.loadURL('http://127.0.0.1:8765/index.html');
  await sleep(2200);
  const js = (c) => win.webContents.executeJavaScript(c, true);

  const at = async (name, sel, extra) => {
    await js(`(() => { const el = document.querySelector('${sel}'); if (el) el.scrollIntoView({block:'start'}); window.scrollBy(0, ${extra || 0}); return 1; })()`);
    await sleep(1100);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('SAVED', name);
  };

  await at('site-sec-hero.png', '.hero', 0);
  await at('site-sec-feat.png', '#features', 0);
  await at('site-sec-bedrock.png', '#bedrock', 0);
  await at('site-sec-bedrock2.png', '.bd-mini-row', -80);
  await at('site-sec-plugins.png', '#plugins', 0);
  await at('site-sec-plugins2.png', '.plug-shot', -60);
  await at('site-sec-shots.png', '#shots', 0);
  await at('site-sec-faq.png', '#faq', 0);
  await at('site-sec-faq2.png', '.faq-group:nth-of-type(2)', -40);
  app.exit(0);
});
