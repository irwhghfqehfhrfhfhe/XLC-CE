/* 基岩版主题标题图预处理：把用户给的「XLC CE 启动器」图片做成可叠在 panorama 上的透明 PNG。
 *
 * 为什么要这一步：用户给的图是白底的（截图 / 微信转存），直接铺到基岩版全景背景上会出现一个白色方块。
 * 这里用 Chromium 自己解码 PNG（不依赖 sharp / PIL），逐像素把接近纯白的背景抠成透明，
 * 再按 alpha>8 的包围盒裁掉多余留白，输出 assets/bedrock/title.png。
 *
 * 用法：electron tools/prep-bedrock-title.js <源图> <输出 png>
 * 注意：必须 env -u ELECTRON_RUN_AS_NODE，否则 Electron 以纯 Node 模式跑，app 模块直接报错。
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
const OUT = process.argv[3];

function run(win, code) { return win.webContents.executeJavaScript(code, true); }

app.commandLine.appendSwitch('mute-audio');
app.whenReady().then(async () => {
  if (!SRC || !OUT) { console.error('用法: electron tools/prep-bedrock-title.js <源图> <输出.png>'); app.exit(2); return; }
  const b64 = fs.readFileSync(SRC).toString('base64');
  const win = new BrowserWindow({
    show: false, width: 900, height: 600,
    webPreferences: { contextIsolation: false, nodeIntegration: false, offscreen: true }
  });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><body></body>'));
  await new Promise(r => win.webContents.once('did-finish-load', r));

  const res = await run(win, `(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${b64}';
    await img.decode();
    const W = img.width, H = img.height;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const im = ctx.getImageData(0, 0, W, H), d = im.data;
    /* 先看原图有没有真透明像素；全不透明才做抠白 */
    let alphaMin = 255;
    for (let i = 3; i < d.length; i += 4) if (d[i] < alphaMin) alphaMin = d[i];
    const hadAlpha = alphaMin < 250;
    let removed = 0;
    if (!hadAlpha) {
      /* 白底抠除：越白越透明，保留金色主体与深色描边的过渡 */
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
        /* 亮度够高且三通道很接近（无彩色的白/浅灰）= 背景 */
        if (mn > 214 && (mx - mn) < 26) {
          const a = Math.max(0, Math.round(255 * (1 - (mn - 214) / 41)));
          d[i + 3] = Math.min(d[i + 3], a);
          if (a < 8) removed++;
        }
      }
      ctx.putImageData(im, 0, 0);
    }
    /* 按 alpha 裁边（留 6px 余量） */
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
    const pad = 6;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
    const ow = x1 - x0 + 1, oh = y1 - y0 + 1;
    const out = document.createElement('canvas');
    out.width = ow; out.height = oh;
    out.getContext('2d').drawImage(cv, x0, y0, ow, oh, 0, 0, ow, oh);
    return { W, H, ow, oh, hadAlpha, removed, dataURL: out.toDataURL('image/png') };
  })()`);

  const buf = Buffer.from(String(res.dataURL).split(',')[1], 'base64');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log('[TITLE] 源 ' + res.W + 'x' + res.H + ' → 输出 ' + res.ow + 'x' + res.oh
    + ' | 原图带 alpha: ' + res.hadAlpha + ' | 抠掉像素: ' + res.removed
    + ' | ' + (buf.length / 1024).toFixed(1) + ' KB');
  console.log('[TITLE] ' + OUT);
  app.exit(0);
});
