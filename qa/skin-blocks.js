/* 验收「账户界面的方块人」：默认（未上传皮肤）时账户页预览 / 主页头像 / 账户设置弹窗
 * 都必须是原版史蒂夫贴图拼出来的方块人，而不是手绘近似版。
 * 用法：./node_modules/.bin/electron qa/skin-blocks.js */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const baseCfg = { username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X', appVersion: '1.2.0', autoCheckUpdate: false, seenVersion: '1.2.0', railPosition: 'left', theme: 'dark', activeAccount: 'Steve' };
const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, patch) => { Object.assign(baseCfg, patch); return Object.assign({}, baseCfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [], major: 0 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4-snapshot-2' }, versions: [] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'X', friends: [] }),
  'friends:presence': () => ({ ok: true, online: [] }),
  'friends:signal-poll': () => ({ ok: true, items: [] }),
  'mp:status': () => ({ ok: true, installed: false }),
  'update:check': () => ({ ok: true, current: '1.2.0', latest: '1.2.0', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }, { name: 'Alex', type: 'offline', model: 'slim' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, frame: false, width: 1240, height: 820, webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  const errs = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errs.push(msg); });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2600);

  /* 主页头像（默认皮肤）也截一张 */
  const hv = await win.webContents.executeJavaScript(`(() => { const b = document.getElementById('heroHead').getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }; })()`, true);
  if (hv && hv.width) fs.writeFileSync(path.join(OUT, 'skin-hero.png'), (await win.webContents.capturePage(hv)).toPNG());

  await win.webContents.executeJavaScript(`(() => { document.querySelector('.rail-btn[data-page="account"]').click(); return true; })()`, true);
  await sleep(1200);

  /* 预览画布像素抽查：默认皮肤下必须出现青色上衣（#00a8a8 附近）与蓝色裤子（#463aa5 附近） */
  const probe = await win.webContents.executeJavaScript(`(() => {
    const cv = document.getElementById('skinPreview');
    const ctx = cv.getContext('2d');
    try {
      const px = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''); };
      const blank = (() => { const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8)n++; return n; })();
      return JSON.stringify({ w: cv.width, h: cv.height, filled: blank, head: px(80, 40), chest: px(80, 130), leg: px(60, 270), armL: px(20, 150) });
    } catch (e) { return JSON.stringify({ tainted: String(e && e.name || e) }); }
  })()`, true);
  console.log('PREVIEW ' + probe);

  const head = await win.webContents.executeJavaScript(`(() => {
    const cv = document.getElementById('heroHead'); const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return JSON.stringify({ filled: n, total: cv.width * cv.height });
  })()`, true);
  console.log('HERO ' + head);

  const rectOf = async (sel) => {
    const r = await win.webContents.executeJavaScript(`(() => { const e = document.querySelector('${sel}'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }; })()`, true);
    return r;
  };

  await win.webContents.executeJavaScript(`(() => { document.getElementById('skinPreview').scrollIntoView({ block: 'center' }); return true; })()`, true);
  await sleep(600);
  const shotAll = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, 'skin-account.png'), shotAll.toPNG());
  const pv = await rectOf('#skinPreview');
  if (pv) {
    const img = await win.webContents.capturePage(pv);
    fs.writeFileSync(path.join(OUT, 'skin-preview.png'), img.toPNG());
  }

  /* 苗条模型（Alex 行）也验一遍：手臂 3px，总宽 14 个皮肤像素 -> 覆盖像素 32800 */
  await win.webContents.executeJavaScript(`(() => { document.querySelectorAll('#accList .ver-row')[1].click(); return true; })()`, true);
  await sleep(700);
  const slim = await win.webContents.executeJavaScript(`(() => {
    const cv = document.getElementById('skinPreview'); const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8)n++;
    return JSON.stringify({ filled: n });
  })()`, true);
  console.log('SLIM ' + slim);
  if (await rectOf('#skinPreview')) fs.writeFileSync(path.join(OUT, 'skin-preview-slim.png'), (await win.webContents.capturePage(await rectOf('#skinPreview'))).toPNG());

  /* 打开账户设置弹窗，截弹窗里的那块画布 */
  await win.webContents.executeJavaScript(`(() => {
    const rows = document.querySelectorAll('#accList .ver-row');
    const btns = rows[0].querySelectorAll('button');
    for (const b of btns) if (b.textContent.trim() === '设置') { b.click(); return true; }
    return false;
  })()`, true);
  await sleep(900);
  const full = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, 'skin-dialog.png'), full.toPNG());
  const dlg = await rectOf('#accSetSkin');
  if (dlg) {
    const img = await win.webContents.capturePage(dlg);
    fs.writeFileSync(path.join(OUT, 'skin-dialog-canvas.png'), img.toPNG());
  }

  console.log('ERRORS ' + JSON.stringify(errs.slice(0, 6)));
  console.log('SHOTS ' + OUT);
  console.log('DONE');
  app.quit();
});
