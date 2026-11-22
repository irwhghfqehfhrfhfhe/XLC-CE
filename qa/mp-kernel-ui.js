/* 联机页「内核版本行」UI 冒烟（隐藏窗口 + 桩）
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/mp-kernel-ui.js
 * 验：版本行渲染 / 已是最新文案 / 检查更新发现新版 / 404·400 的错误提示文案
 * 截图：qa/out/mp-kernel-row.png（设 QA_SHOW=1 才会有像素） */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { QA_SHOW, shotFile } = require('./_vis');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const OUT = path.join(__dirname, 'out');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lines = [];
let fail = 0;
const ok = (cond, name, extra) => {
  if (!cond) fail++;
  lines.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ← ' + extra : ''));
};

const baseCfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: '1.4.7', autoCheckUpdate: false, seenVersion: '1.4.7',
  railPosition: 'left', theme: 'dark', accentColor: '', bgMode: 'default', activeAccount: 'Steve'
};
const ST = {
  latest: '0.4.2',
  live: '0.4.2',
  checkResult: null
};

const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, p) => { Object.assign(baseCfg, p); return Object.assign({}, baseCfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3' }, versions: [] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888-8888', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: true, status: {} }),
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'friends:signal-send': () => ({ ok: true }),
  'mp:status': () => ({
    ok: true, installed: true, version: '0.4.2', latest: ST.latest, outdated: ST.latest !== '0.4.2',
    running: true, port: 1234, liveVersion: ST.live, mismatch: ST.live !== '0.4.2'
  }),
  'mp:kernel-check': () => ST.checkResult || { ok: true, version: '0.4.2', latest: '0.4.2', outdated: false },
  'mp:start': () => ({ ok: true, port: 1234 }),
  'mp:state': () => ({ ok: true, state: { state: 'waiting', index: 0 } }),
  'mp:act': () => ({ ok: true, status: 200 }),
  'mp:download': () => ({ ok: true, version: '0.4.2' }),
  'mp:publish-mods': () => ({ ok: true, stopped: true }),
  'mp:room-mods': () => ({ ok: false, error: '超时' }),
  'update:check': () => ({ ok: true, current: '1.4.7', latest: '1.4.7', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'plugin:list': () => ({ ok: true, items: [] })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: QA_SHOW, frame: false, width: 1240, height: 820, paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true
    }
  });
  const js = (code) => win.webContents.executeJavaScript(code, true);
  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  await sleep(2600);

  await js(`(() => { if (typeof gotoPage === 'function') { gotoPage('mp'); return true; } return false; })()`);
  await sleep(1500);

  const s1 = await js(`(() => {
    const row = document.getElementById('mpKernel');
    return JSON.stringify({
      exists: !!row,
      visible: !!(row && row.offsetParent !== null),
      txt: (document.getElementById('mpKernelTx') || {}).textContent || '',
      dot: (document.getElementById('mpKernelDot') || {}).className || '',
      btnCheck: !!document.getElementById('mpBtnKernelCheck'),
      btnFix: !!document.getElementById('mpBtnKernelFix')
    });
  })()`);
  const r1 = JSON.parse(s1);
  ok(r1.exists && r1.visible, '内核版本行存在且可见', s1);
  ok(/v0\.4\.2/.test(r1.txt), '显示当前版本 v0.4.2', r1.txt);
  ok(/已是最新/.test(r1.txt), '上游同版本时显示「已是最新」', r1.txt);
  ok(/ok/.test(r1.dot), '状态点是绿色（ok）', r1.dot);
  ok(r1.btnCheck && r1.btnFix, '两颗按钮都在');

  /* 场景：上游发了新版 → 点「检查更新」应变成可更新 */
  ST.checkResult = { ok: true, version: '0.4.2', latest: '0.4.3', outdated: true };
  await js(`document.getElementById('mpBtnKernelCheck').click(), true`);
  await sleep(900);
  const t2 = await js(`document.getElementById('mpKernelTx').textContent`);
  ok(/可更新到 v0\.4\.3/.test(t2), '检查更新后发现新版', t2);

  /* 场景：端口上跑着别的内核（版本不符） */
  ST.live = '0.3.14';
  await js(`(typeof mpKernelRefresh === 'function') ? mpKernelRefresh() : null`);
  await sleep(700);
  const t3 = await js(`document.getElementById('mpKernelTx').textContent`);
  const d3 = await js(`document.getElementById('mpKernelDot').className`);
  ok(/0\.3\.14/.test(t3), '端口上的内核版本不一致会写出来', t3);
  ok(/bad/.test(d3), '不一致时状态点变红', d3);
  ST.live = '0.4.2';

  /* 场景：加入失败的错误提示 */
  const h404 = await js(`mpJoinErrHint({ ok:false, status:404 })`);
  const h400 = await js(`mpJoinErrHint({ ok:false, status:400 })`);
  ok(/重装内核/.test(h404), 'HTTP 404 提示指向「重装内核」', h404);
  ok(/房间码/.test(h400), 'HTTP 400 提示指向房间码格式', h400);

  await js(`(typeof mpKernelRefresh === 'function') ? mpKernelRefresh() : null`);
  await sleep(500);
  await shotFile(win, path.join(OUT, 'mp-kernel-row.png'));

  console.log(lines.join('\n'));
  console.log(fail ? '\nFAILED ' + fail + ' 项' : '\nALL PASS (' + lines.length + ' 项)');
  if (QA_SHOW) console.log('截图 qa/out/mp-kernel-row.png');
  app.exit(fail ? 1 : 0);
});
