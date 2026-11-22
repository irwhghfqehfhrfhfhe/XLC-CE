/* 把 Minecraft 客户端 jar 里挖出来的 6 张全景贴图，拼成一张能横向无缝循环的 4:1 长条图。
 *
 * 为什么是 4:1：全景是立方体贴图，panorama_0..3 正好是绕一圈的东南西北四面（各 90°），
 * 把它们按顺序横着排成 4:1，平移 25% 就正好转 90°，循环回起点完全无缝 —— 看起来就是
 * 基岩版主菜单那种镜头慢慢转的感觉，而且只要一张图、不用 3D 立方体那套。
 *
 * 顺带做两件事：
 *   ① 打印四条接缝的色差（判断顺序/朝向对不对，顺序错了接缝会突然跳）
 *   ② 输出一张缩略预览图，方便肉眼确认
 *
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron tools/make-bedrock-pano.js [源目录]
 *   源目录默认 .tmp-pano/faces，里面放 0.png 1.png 2.png 3.png（左上右下四张）
 *   产物：assets/bedrock/panorama.jpg + tools/out/pano-preview.png
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, '.tmp-pano', 'faces'));
const OUT_IMG = path.join(ROOT, 'assets', 'bedrock', 'panorama.jpg');
const OUT_PRV = path.join(__dirname, 'out', 'pano-preview.png');
const FACE = 1024;                    /* 每面输出 1024×1024，整条 4096×1024 */
const QUALITY = 84;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const files = [0, 1, 2, 3].map(i => path.join(SRC, i + '.png'));
    for (const f of files) if (!fs.existsSync(f)) throw new Error('缺文件: ' + f);
    const dataURLs = files.map(f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));

    const win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { offscreen: false } });
    await win.loadURL('data:text/html,<body style="margin:0;background:#000"></body>');

    const res = await win.webContents.executeJavaScript(`(async () => {
      const FACE = ${FACE};
      const urls = ${JSON.stringify(dataURLs)};
      const img = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const imgs = await Promise.all(urls.map(img));

      const c = document.createElement('canvas');
      c.width = FACE * 4; c.height = FACE;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      imgs.forEach((im, i) => g.drawImage(im, i * FACE, 0, FACE, FACE));

      /* 接缝检查：每一对相邻面的边界列（左面最后一列 vs 右面第一列）平均色差 */
      const colDiff = (x1, x2) => {
        const a = g.getImageData(x1, 0, 1, FACE).data;
        const b = g.getImageData(x2, 0, 1, FACE).data;
        let s = 0;
        for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]);
        return +(s / (FACE * 3)).toFixed(2);
      };
      const seams = [];
      for (let i = 0; i < 3; i++) seams.push({ at: i + '|' + (i + 1), d: colDiff((i + 1) * FACE - 1, (i + 1) * FACE) });
      /* 首尾也算：0 面左边 vs 3 面右边（循环接缝） */
      seams.push({ at: '3|0', d: colDiff(0, FACE * 4 - 1) });

      const jpg = c.toDataURL('image/jpeg', ${QUALITY / 100});

      /* 预览：缩到 1200 宽 */
      const p = document.createElement('canvas');
      p.width = 1200; p.height = 300;
      p.getContext('2d').drawImage(c, 0, 0, 1200, 300);
      return { jpg, prv: p.toDataURL('image/png'), seams, size: [c.width, c.height], faces: imgs.map(i => i.width + 'x' + i.height) };
    })()`, true);

    fs.mkdirSync(path.dirname(OUT_IMG), { recursive: true });
    fs.mkdirSync(path.dirname(OUT_PRV), { recursive: true });
    fs.writeFileSync(OUT_IMG, Buffer.from(res.jpg.split(',')[1], 'base64'));
    fs.writeFileSync(OUT_PRV, Buffer.from(res.prv.split(',')[1], 'base64'));
    console.log('faces   : ' + res.faces.join(' '));
    console.log('strip   : ' + res.size.join('x'));
    console.log('seams   : ' + res.seams.map(s => s.at + '=' + s.d).join('  '));
    const kb = (fs.statSync(OUT_IMG).size / 1024).toFixed(0);
    console.log('out     : ' + path.relative(ROOT, OUT_IMG) + '  ' + kb + ' KB');
    console.log('preview : ' + path.relative(ROOT, OUT_PRV));
    app.exit(0);
  } catch (e) {
    console.log('THROWN ' + (e && e.stack || e));
    app.exit(2);
  }
});
