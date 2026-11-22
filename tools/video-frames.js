/* 用 Chromium 解视频，按时间点抽帧存 PNG（本机没有 ffmpeg）
 * 用法：./node_modules/.bin/electron tools/video-frames.js <input.mp4> [输出目录] [帧数]
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const [inPath, outDirArg, nArg] = process.argv.slice(2);
if (!inPath) { console.error('用法: electron tools/video-frames.js <input.mp4> [outDir] [n]'); app.exit(2); }
const outDir = outDirArg || path.join(__dirname, '..', 'qa', 'out');
const N = Math.max(2, parseInt(nArg || '10', 10) || 10);
fs.mkdirSync(outDir, { recursive: true });

const url = 'file:///' + inPath.replace(/\\/g, '/').replace(/ /g, '%20').replace(/#/g, '%23');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('mute-audio');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { offscreen: true } });
  /* 页面必须自己也落在 file:// 上：data: 页面是 opaque origin，Chromium 不让它加载 file:// 视频 */
  const pageFile = path.join(outDir, '_player.html');
  fs.writeFileSync(pageFile, '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">'
    + '<video id="v" src="' + url + '" preload="auto" muted playsinline></video></body>');
  await win.loadURL('file:///' + pageFile.replace(/\\/g, '/').replace(/ /g, '%20'));

  await win.webContents.executeJavaScript(`new Promise((res) => {
    const v = document.getElementById('v');
    if (v.readyState >= 1) return res(v.duration);
    v.addEventListener('loadedmetadata', () => res(v.duration), { once: true });
    v.addEventListener('error', () => res(-1), { once: true });
    setTimeout(() => res(-2), 15000);
  })`).then(async (dur) => {
    if (dur <= 0) { console.log('DECODE_FAIL dur=' + dur); app.exit(1); return; }
    console.log('duration=' + dur.toFixed(2) + 's  frames=' + N);
    const vw = await win.webContents.executeJavaScript('document.getElementById("v").videoWidth');
    const vh = await win.webContents.executeJavaScript('document.getElementById("v").videoHeight');
    console.log('size=' + vw + 'x' + vh);
    for (let i = 0; i < N; i++) {
      const t = Math.min(dur - 0.05, (dur * (i + 0.5)) / N);
      const url2 = await win.webContents.executeJavaScript(`(async () => {
        const v = document.getElementById('v');
        await new Promise((res) => { const done = () => res(); v.addEventListener('seeked', done, { once: true }); v.currentTime = ${t}; setTimeout(res, 4000); });
        const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        return c.toDataURL('image/png');
      })()`);
      if (!url2 || url2.indexOf('data:image/png') !== 0) { console.log('frame ' + i + ' FAIL'); continue; }
      const file = path.join(outDir, 'vid-' + String(i).padStart(2, '0') + '-t' + t.toFixed(1).replace('.', '_') + '.png');
      fs.writeFileSync(file, Buffer.from(url2.split(',')[1], 'base64'));
      console.log('saved ' + file);
    }
    app.exit(0);
  });
});
