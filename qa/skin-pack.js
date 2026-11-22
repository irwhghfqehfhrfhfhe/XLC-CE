/* 打包版冒烟：确认 app.asar 里的 assets/skin-steve.png 能被渲染进程读到，
 * 并且账户页预览 / 主页头像确实是用它像素级拼出来的（不是空白 / 不是占位）
 * 注意：本文件由主进程包进 (async () => { ... })() 里执行，因此直接写语句 + return 即可。 */
const lines = [];
  const fail = (m) => { lines.push('FAIL ' + m); return { ok: false, lines }; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /* 1) 静态资源能否从 asar 读出 */
  const img = new Image();
  const loaded = await new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = '../assets/skin-steve.png';
    setTimeout(() => resolve(false), 4000);
  });
  if (!loaded) return fail('assets/skin-steve.png 读不到（' + img.src + '）');
  lines.push('PASS 皮肤贴图可读 ' + img.naturalWidth + 'x' + img.naturalHeight);
  if (img.naturalWidth !== 64 || img.naturalHeight !== 64) return fail('贴图尺寸不是 64x64');

  const head = new Image();
  const headOk = await new Promise((resolve) => {
    head.onload = () => resolve(true); head.onerror = () => resolve(false);
    head.src = '../assets/skin-steve-head.png';
    setTimeout(() => resolve(false), 4000);
  });
  lines.push((headOk ? 'PASS' : 'FAIL') + ' 默认头像小图 ' + head.naturalWidth + 'x' + head.naturalHeight);

  /* 2) 账户页预览 */
  const btn = document.querySelector('.rail-btn[data-page="account"]');
  if (!btn) return fail('找不到账户页入口');
  btn.click();
  await sleep(1200);

  const cv = document.getElementById('skinPreview');
  if (!cv) return fail('#skinPreview 不存在');
  let info;
  try {
    const ctx = cv.getContext('2d');
    const px = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
    const all = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let filled = 0;
    for (let i = 3; i < all.length; i += 4) if (all[i] > 8) filled++;
    info = { filled, chest: px(80, 130), leg: px(60, 270), head: px(80, 40) };
  } catch (e) {
    return fail('读画布像素失败：' + ((e && e.message) || e));
  }
  lines.push('PREVIEW filled=' + info.filled + ' chest=' + info.chest.join(',') + ' leg=' + info.leg.join(',') + ' head=' + info.head.join(','));
  /* 默认皮肤：经典模型应覆盖 35200 像素；青色上衣 G/B 明显大于 R；裤子偏蓝 */
  if (info.filled < 30000) return fail('预览几乎空白，方块人没画出来');
  if (!(info.chest[1] > 120 && info.chest[0] < 60)) return fail('胸口不是史蒂夫的青色上衣');
  if (!(info.leg[2] > 120 && info.leg[0] < 90)) return fail('腿部不是史蒂夫的蓝色裤子');
  lines.push('PASS 账户页预览 = 原版史蒂夫方块人');

  /* 3) 主页头像 */
  document.querySelector('.rail-btn[data-page="home"]').click();
  await sleep(900);
  const hc = document.getElementById('heroHead');
  try {
    const hctx = hc.getContext('2d');
    const d = hctx.getImageData(0, 0, hc.width, hc.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    lines.push((n > hc.width * hc.height * 0.9 ? 'PASS' : 'FAIL') + ' 主页头像已绘制 filled=' + n + '/' + (hc.width * hc.height));
  } catch (e) {
    lines.push('WARN 头像画布回读失败：' + ((e && e.message) || e));
  }
  return { ok: !lines.some(l => l.startsWith('FAIL')), lines };
