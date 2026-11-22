/* 验证抽取出来的 m4a 能否被 Electron(Chromium) 正常解码：
 *   能读到 duration 且 > 0、play() 不报错，才算真的能放。
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron tools/audio-check.js <file>
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');

const file = process.argv[process.argv.length - 1];

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 400, height: 200 });
  await win.loadFile(path.join(__dirname, 'audio-check.html'));
  const url = 'file:///' + file.replace(/\\/g, '/').replace(/^\//, '');
  try {
    const res = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const a = document.getElementById('a');
        const done = (o) => { try { a.pause(); } catch (_) {} resolve(o); };
        a.src = ${JSON.stringify(url)};
        a.onloadedmetadata = () => {
          const meta = { duration: a.duration, readyState: a.readyState };
          a.play().then(() => setTimeout(() => done(Object.assign(meta, { playing: !a.paused, currentTime: a.currentTime })), 700))
                  .catch((e) => done(Object.assign(meta, { playError: String(e && e.name) })));
        };
        a.onerror = () => done({ error: a.error && a.error.code, message: a.error && a.error.message });
        setTimeout(() => done({ timeout: true }), 8000);
      })
    `, true);
    console.log('[AUDIO]', JSON.stringify(res));
  } catch (e) {
    console.log('[AUDIO] exception', e && e.message);
  }
  app.exit(0);
});
