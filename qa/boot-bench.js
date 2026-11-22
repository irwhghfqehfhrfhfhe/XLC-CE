/* 启动基准测试：分离 electron 基线 / 透明窗口开销 / 页面加载开销。
   用法：env SCENE=empty|empty-trans|page|page-trans node_modules/electron/dist/electron.exe qa/boot-bench.js
   输出 BOOT_MS=<毫秒> 表示从进程启动到窗口 ready-to-show 的耗时。 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const t0 = Date.now();
const scene = process.env.SCENE || 'empty';
const transparent = scene.endsWith('-trans');

app.whenReady().then(() => {
  const opts = { show: false, width: 1220, height: 780, frame: false };
  if (transparent) { opts.transparent = true; opts.backgroundColor = '#00000000'; }
  else opts.backgroundColor = '#0b0d11';
  const w = new BrowserWindow(opts);
  w.once('ready-to-show', () => {
    console.log('BOOT_MS=' + (Date.now() - t0) + ' scene=' + scene);
    setTimeout(() => app.exit(0), 50);
  });
  if (scene.startsWith('page')) {
    w.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  } else {
    w.loadURL('data:text/html,<body style="background:#0b0d11"></body>');
  }
});
