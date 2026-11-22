const { app, nativeImage } = require('electron');
const fs = require('fs');
app.whenReady().then(() => {
  const img = nativeImage.createFromPath(process.argv[2]);
  const s = img.getSize();
  const h = +process.argv[4] || 150;
  const w = +process.argv[5] || 560;
  const c = img.crop({ x: 0, y: s.height - h, width: w, height: h }).resize({ width: w * 2 });
  fs.writeFileSync(process.argv[3], c.toPNG());
  console.log('ok', s.width, s.height);
  app.exit(0);
});
