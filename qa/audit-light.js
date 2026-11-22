/* 浅色模式配色审计：逐页遍历 DOM，找出「深色主题残留」和「对比度不足」的节点
 * 用法：./node_modules/.bin/electron qa/audit-light.js [accentHex]
 * 判定：
 *   1) 浅色模式下背景仍是白色半透明（rgba(255,255,255,a)）→ 白底白块
 *   2) 文字颜色过亮（相对亮度 > .62）且所在背景是浅色 → 几乎看不清
 *   3) 强调色填充面（--grad / --acc）上的文字对比度 < 3 → 自定义主题色翻车
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const ACCENT = String(process.argv[2] || '');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const mk = (id, type) => ({ id, type, releaseTime: '2026-10-05T10:00:00+00:00' });
const versions = ['26.3', '26.2', '26.1', '1.21.11'].map(v => mk(v, 'release')).concat([mk('26.4-snapshot-2', 'snapshot')]);

const baseCfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: '1.2.0', autoCheckUpdate: false, seenVersion: '1.2.0',
  railPosition: 'left', theme: 'light', accentColor: ACCENT, bgMode: 'default', activeAccount: 'Steve'
};
const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, p) => { Object.assign(baseCfg, p); return Object.assign({}, baseCfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [{ id: '26.3', dir: '26.3', hasJson: true, loader: '' }], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4-snapshot-2' }, versions } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888', friends: [] }),
  'friends:presence': () => ({ ok: true, online: [] }),
  'friends:signal-poll': () => ({ ok: true, items: [] }),
  'mp:status': () => ({ ok: true, installed: false }),
  'update:check': () => ({ ok: true, current: '1.2.0', latest: '1.2.0', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:list': () => ({ ok: true, items: [] })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const AUDIT_JS = `(() => {
  const lum = (r, g, b) => {
    const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
  };
  const parse = (s) => {
    let m = /rgba?\\(([^)]+)\\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const ratio = (c1, c2) => {
    const l1 = lum(c1.r, c1.g, c1.b), l2 = lum(c2.r, c2.g, c2.b);
    return ((Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05));
  };
  /* 往上找第一个不透明背景；渐变底取渐变里的颜色均值（否则会当成透明，误判成白底） */
  const gradOf = (el) => {
    const bi = getComputedStyle(el).backgroundImage || '';
    if (!bi.includes('gradient')) return null;
    const cs = [...bi.matchAll(/rgba?\\(([^)]+)\\)/g)].map(m => {
      const p = m[1].split(',').map(parseFloat);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }).filter(c => c.a > .5);
    if (!cs.length) return null;
    return { r: cs.reduce((s, c) => s + c.r, 0) / cs.length, g: cs.reduce((s, c) => s + c.g, 0) / cs.length, b: cs.reduce((s, c) => s + c.b, 0) / cs.length, a: 1 };
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > .9) return c;
      const g = gradOf(n);
      if (g) return g;
      n = n.parentElement;
    }
    const c = parse(getComputedStyle(document.body).backgroundColor);
    return c || { r: 255, g: 255, b: 255, a: 1 };
  };
  const who = (el) => {
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + cls;
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || !el.getClientRects().length) continue;
    const b = parse(st.backgroundColor);
    const fg = parse(st.color);
    const bg = bgOf(el);
    const key = who(el) + '|' + st.color + '|' + st.backgroundColor;
    if (seen.has(key)) continue;
    if (!el.textContent.trim() && el.children.length === 0 && st.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
    /* 1) 白半透明底（深色主题残留） */
    if (b && b.a > .02 && b.a < .95 && b.r > 235 && b.g > 235 && b.b > 235) {
      out.push('WHITEBG ' + who(el) + ' bg=' + st.backgroundColor);
    }
    /* 2) 文字过亮 */
    if (fg && fg.a > .5 && el.textContent.trim()) {
      const r = ratio(fg, bg);
      if (r < 2.4) out.push('LOWTEXT ' + who(el) + ' color=' + st.color + ' on rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ') ratio=' + r.toFixed(2) + ' text="' + el.textContent.trim().slice(0, 14) + '"');
    }
    /* 3) 强调色面上的文字 */
    if (st.backgroundImage && st.backgroundImage.includes('gradient') && el.textContent.trim()) {
      const m = /rgb\\(([^)]+)\\)[^,]*,\\s*rgb\\(([^)]+)\\)/.exec(st.backgroundImage);
      if (m) {
        const c1 = parse('rgb(' + m[1] + ')'), c2 = parse('rgb(' + m[2] + ')');
        const mid = { r: (c1.r + c2.r) / 2, g: (c1.g + c2.g) / 2, b: (c1.b + c2.b) / 2 };
        const r = ratio(fg, mid);
        if (r < 3) out.push('GRADTXT ' + who(el) + ' color=' + st.color + ' gradMid=rgb(' + Math.round(mid.r) + ',' + Math.round(mid.g) + ',' + Math.round(mid.b) + ') ratio=' + r.toFixed(2) + ' text="' + el.textContent.trim().slice(0, 14) + '"');
      }
    }
  }
  return out;
})()`;

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, frame: false, width: 1240, height: 820, webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2600);

  const all = [];
  const audit = async (label) => {
    const r = await win.webContents.executeJavaScript(AUDIT_JS, true);
    for (const line of r) all.push('[' + label + '] ' + line);
  };
  const go = async (page, wait) => {
    await win.webContents.executeJavaScript(`(() => { const b = document.querySelector('.rail-btn[data-page="${page}"]'); if (b) b.click(); return true; })()`, true);
    await sleep(wait || 1000);
  };

  for (const p of ['home', 'download', 'tools', 'plugins', 'account', 'friends', 'mp', 'diag', 'import', 'settings']) {
    await go(p);
    await audit(p);
  }
  /* 展开一张版本卡的面板（开始安装按钮在里面） */
  await go('download', 1200);
  await win.webContents.executeJavaScript(`(() => { const b = document.querySelector('.pv-card .pv-btn'); if (b) b.click(); return true; })()`, true);
  await sleep(800);
  await audit('download-panel');

  const uniq = [...new Set(all)].sort();
  fs.writeFileSync(path.join(OUT, 'audit-light.txt'), 'ACCENT=' + (ACCENT || '(default)') + '\n' + uniq.join('\n') + '\n');
  console.log('ACCENT=' + (ACCENT || '(default)'));
  console.log('FINDINGS ' + uniq.length);
  for (const l of uniq) console.log(l);
  console.log('DONE');
  app.quit();
});
