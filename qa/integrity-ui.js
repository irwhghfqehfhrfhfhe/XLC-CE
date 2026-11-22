/* 诊断页「实例文件完整性」卡片的界面流程（桩掉 IPC，只验 UI）：
 *   ① 启动被完整性闸门拦下（launch:exit 带 integrity）→ 自动跳诊断页 → 列出缺失文件 → 自动修复 → 变「完整」
 *   ② 手动「检查实例文件」/「一键修复」按钮可用
 * 用法：./node_modules/.bin/electron qa/integrity-ui.js
 * 产物：qa/out/integrity-1-broken.png / integrity-2-fixed.png */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const baseCfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: '1.2.0', autoCheckUpdate: false, seenVersion: '1.2.0',
  railPosition: 'left', theme: process.env.QA_THEME || 'dark', accentColor: '', bgMode: 'default', activeAccount: 'Steve', lastVersion: '1.21.4-fabric'
};

const ST = { repaired: false, integrityCalls: 0, repairCalls: 0, repairStartedAt: 0 };

const probs = [
  { file: 'fabric-loader-0.20.1.jar', rel: 'net/fabricmc/fabric-loader/0.20.1/fabric-loader-0.20.1.jar', path: 'D:\\X\\libraries\\net\\fabricmc\\fabric-loader\\0.20.1\\fabric-loader-0.20.1.jar', reason: 'missing' },
  { file: 'sponge-mixin-0.17.5.jar', rel: 'net/fabricmc/sponge-mixin/0.17.5/sponge-mixin-0.17.5.jar', path: 'D:\\X\\libraries\\x', reason: 'corrupt' },
  { file: 'client.jar', rel: 'versions/1.21.4/1.21.4.jar', path: 'D:\\X\\versions\\1.21.4\\1.21.4.jar', reason: 'empty' }
];

const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, p) => { Object.assign(baseCfg, p); return Object.assign({}, baseCfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [{ id: '1.21.4-fabric', dir: '1.21.4-fabric', hasJson: true, loader: 'Fabric' }], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '1.21.4', snapshot: '1.21.4' }, versions: [{ id: '1.21.4', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' }] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'update:check': () => ({ ok: true, current: '1.2.0', latest: '1.2.0', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:list': () => ({ ok: true, items: [] }),
  'friends:get': () => ({ ok: true, code: '', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: false, status: {} }),
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: false }),
  'version:info': () => ({ ok: true, id: '1.21.4-fabric', mcVer: '1.21.4', loader: 'Fabric', loaderVer: '0.20.1' }),
  'diag:launcher': () => ({ ok: true, crashes: [], diagDir: 'D:\\X' }),
  'diag:game': () => ({ ok: true, diag: { found: false, note: '无崩溃日志', rules: [], modsInvolved: [], integrity: null } }),
  /* 修复前：3 个问题；修复后：完整 */
  'diag:integrity': () => {
    ST.integrityCalls++;
    return ST.repaired
      ? { ok: true, integrity: { ok: true, instance: '1.21.4-fabric', total: 42, problems: [], deep: true } }
      : { ok: true, integrity: { ok: false, instance: '1.21.4-fabric', total: 42, problems: probs, deep: true } };
  },
  'diag:repair': () => {
    ST.repairCalls++;
    ST.repairStartedAt = Date.now();
    ST.repaired = true;
    return { ok: true, repair: { ok: true, fixed: 3, tried: 3, failed: [], remaining: [] }, integrity: { ok: true, instance: '1.21.4-fabric', total: 42, problems: [], deep: true } };
  }
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lines = [];
const ok = (c, n, e) => { lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : '')); };

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false, frame: false, width: 1240, height: 860, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true }
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2800);
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const shot = async (name) => {
    await js(`(() => { if (document.getElementById('qaNoAnim')) return true;
      const st = document.createElement('style'); st.id = 'qaNoAnim';
      st.textContent = '*,*::before,*::after{animation:none !important;transition:none !important}';
      document.head.appendChild(st); return true; })()`);
    try { win.webContents.invalidate(); } catch (_) {}
    await sleep(400);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  };

  /* ---- ① 模拟「启动被完整性闸门拦下」：主进程推 launch:exit ---- */
  win.webContents.send('launch:exit', {
    code: -1, error: '实例文件不完整（3 个文件缺失或损坏），已转到诊断页，可一键修复',
    integrity: { ok: false, instance: '1.21.4-fabric', total: 42, problems: probs, deep: false }
  });
  /* 等自动修复跑完并把结果渲染出来（repair 接口返回后才会重绘卡片） */
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    if (ST.repairCalls > 0) break;
  }
  let d1 = null;
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    const st1 = await js(`(() => {
    const page = document.getElementById('page-diag');
    const active = page && page.classList.contains('active');
    const sel = document.getElementById('diagInstance');
    return JSON.stringify({
      active, sel: sel && sel.value,
      hasCard: !!document.getElementById('btnDiagRepair'),
      cardHtml: (document.getElementById('diagIntegrityOut') || {}).innerHTML || ''
    });
  })()`);
    d1 = JSON.parse(st1);
    if (/完整/.test(d1.cardHtml)) break;
  }
  ok(d1.active === true, '被拦下后自动跳到诊断页');
  ok(d1.sel === '1.21.4-fabric', '诊断页实例已对齐到出问题的实例', d1.sel);
  ok(ST.repairCalls > 0, '自动开始修复（无需用户再点）', 'repair calls=' + ST.repairCalls);
  ok(/完整/.test(d1.cardHtml) && !/个文件缺失或损坏/.test(d1.cardHtml), '修复后卡片显示「完整」');
  await shot('integrity-2-fixed' + (process.env.QA_THEME === 'light' ? '-light' : ''));

  /* ---- ② 手动流程：先「检查」再「一键修复」 ---- */
  ST.repaired = false; ST.repairCalls = 0; ST.integrityCalls = 0;
  await js(`(() => { document.getElementById('btnDiagCheck').click(); return true; })()`);
  await sleep(700);
  const st2 = await js(`(() => {
    const box = document.getElementById('diagIntegrityOut');
    return JSON.stringify({ html: box.innerHTML, rows: box.querySelectorAll('.mps-row').length });
  })()`);
  const d2 = JSON.parse(st2);
  ok(d2.rows === 3, '「检查实例文件」列出 3 个问题文件', 'rows=' + d2.rows);
  ok(/fabric-loader/.test(d2.html), '清单里能看到加载器本体缺失');
  await shot('integrity-1-broken' + (process.env.QA_THEME === 'light' ? '-light' : ''));

  await js(`(() => { document.getElementById('btnDiagRepair').click(); return true; })()`);
  await sleep(800);
  const st3 = await js(`(() => document.getElementById('diagIntegrityOut').innerHTML)()`);
  ok(ST.repairCalls === 1, '「一键修复」按钮真的调了修复接口', 'calls=' + ST.repairCalls);
  ok(/完整/.test(st3), '修复完成后卡片变为「完整」');

  const pass = lines.every(l => !l.startsWith('FAIL'));
  console.log(lines.join('\n'));
  console.log('[INTEGRITY-UI] ' + (pass ? 'PASS' : 'FAIL'));
  try { fs.writeFileSync(path.join(OUT, 'integrity-ui.log'), lines.join('\n') + '\n[INTEGRITY-UI] ' + (pass ? 'PASS' : 'FAIL') + '\n', 'utf8'); } catch (_) {}
  app.exit(pass ? 0 : 1);
});
