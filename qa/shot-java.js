/* 1.4.14 截图：①下载页 Java（有 Java / 没 Java 两种）②日期彩蛋标语（7-12 / 10-7）
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/shot-java.js
 * 产物：qa/out/bd-java-1414.png / bd-java-empty-1414.png / bd-splash-712-1414.png / bd-splash-107-1414.png */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const cfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: '1.4.14', autoCheckUpdate: false, seenVersion: '1.4.14',
  railPosition: 'left', theme: 'bedrock', accentColor: '', bgMode: 'default', activeAccount: 'Steve',
  uiSound: false, launchVisibility: 'keep', forceChinese: true, startPage: 'bedrock', bdSky: 'auto',
  javaPath: 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.6.7-hotspot\\bin\\javaw.exe'
};
const javas = [
  { path: 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.6.7-hotspot\\bin\\javaw.exe', major: 21, ver: '21.0.6' },
  { path: 'C:\\Program Files\\Java\\jdk-17\\bin\\javaw.exe', major: 17, ver: '17.0.12' },
  { path: 'D:\\X\\runtime\\lmc-java-25\\bin\\javaw.exe', major: 25, ver: '25.0.2' },
  { path: 'C:\\Program Files (x86)\\Java\\jre1.8.0_411\\bin\\javaw.exe', major: 8, ver: '1.8.0_411' }
];

const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [], broken: [] }),
  'java:detect': () => javas.map(j => Object.assign({}, j)),
  'java:list': () => ({ ok: true, javas: javas.map(j => Object.assign({}, j)) }),
  'java:open-runtime': () => ({ ok: true, dir: 'D:\\X\\runtime', skipped: true }),
  'java:download': async (_e, major) => {
    for (let i = 1; i <= 5; i++) {
      if (WIN) WIN.webContents.send('install:progress', { stage: 'java', percent: i * 20, text: 'Java ' + major + ' · ' + (i * 14) + ' MB / 72 MB' });
      await sleep(420);
    }
    return { ok: true, javaw: (javas[2] || {}).path };
  },
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4' }, versions: [
    { id: '26.3', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' },
    { id: '1.21.4', type: 'release', releaseTime: '2025-12-05T10:00:00+00:00' }
  ] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888-8888', friends: [] }),
  'friends:presence': () => ({ ok: true, connected: true, status: {} }),
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', latest: '0.4.2', outdated: false, running: false, port: 0 }),
  'update:check': () => ({ ok: true, current: '1.4.14', latest: '1.4.14', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'mods:list': () => ({ ok: true, mods: [] }),
  'mods:dir': () => ({ ok: true, dir: 'D:\\X\\mods' }),
  'plugin:list': () => ({ ok: true, plugins: { seedmap: true, server: true, gamepad: true, translator: true }, third: [] })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let WIN = null;

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false, frame: false, width: 1280, height: 880, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true }
  });
  WIN = win;
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(3200);
  const js = (code) => win.webContents.executeJavaScript(code, true);
  await js(`(() => {
    if (document.getElementById('qaNoAnim')) return true;
    const st = document.createElement('style');
    st.id = 'qaNoAnim';
    st.textContent = '*,*::before,*::after{animation:none !important;transition:none !important}';
    document.head.appendChild(st);
    return true;
  })()`);
  const shot = async (name) => {
    try { win.webContents.invalidate(); } catch (_) {}
    await sleep(450);
    fs.writeFileSync(path.join(OUT, name), (await win.webContents.capturePage()).toPNG());
    console.log('saved qa/out/' + name);
  };

  /* ---- 日期彩蛋标语 ---- */
  for (const [key, name] of [['7-12', 'bd-splash-712-1414.png'], ['10-7', 'bd-splash-107-1414.png']]) {
    console.log(key + ' ' + await js(`JSON.stringify({ t: window.BEDROCK.splashTestDay('${key}'), shown: (document.getElementById('bdSplash')||{}).textContent })`));
    await shot(name);
  }
  await js(`window.BEDROCK.splashTestDay('')`);

  /* ---- 下载页 Java ---- */
  await js(`window.gotoPage('download')`);
  await sleep(1200);
  await js(`document.querySelector('#bdDlTabs [data-cat="java"]').click()`);
  await sleep(1200);
  console.log('JAVA ' + await js(`(() => {
    const b = document.querySelector('#bdDlJava');
    return JSON.stringify({
      on: b.classList.contains('on'),
      rows: b.querySelectorAll('.bd-jv-row').length,
      cur: (b.querySelector('.bd-jv-row.cur .bd-jv-main b') || {}).textContent,
      dls: Array.from(b.querySelectorAll('[data-jdl]')).map(x => x.dataset.jdl),
      h: Math.round(b.getBoundingClientRect().height),
      scrollH: b.querySelector('.bd-jv-scroll') ? b.querySelector('.bd-jv-scroll').scrollHeight : 0,
      overflow: b.querySelector('.bd-jv-scroll') ? (b.querySelector('.bd-jv-scroll').scrollHeight > b.querySelector('.bd-jv-scroll').clientHeight + 2) : null
    });
  })()`));
  await shot('bd-java-1414.png');

  /* 点「用这个」换一行，验证高亮跟着走 */
  await js(`(() => { const r = document.querySelectorAll('#bdDlJava .bd-jv-row')[2]; r && r.querySelector('[data-jact="use"]').click(); })()`);
  await sleep(800);
  console.log('USE ' + await js(`(() => {
    const r = document.querySelector('#bdDlJava .bd-jv-row.cur');
    return JSON.stringify({ cur: r ? r.dataset.jpath : '', input: document.getElementById('setJavaPath').value });
  })()`));
  await shot('bd-java-cur-1414.png');

  /* 下载中的样子：点「Java 21」，主进程按 5 段推进度 */
  await js(`document.querySelector('#bdDlJava [data-jdl="21"]').click()`);
  await sleep(1000);
  console.log('DL ' + await js(`(() => {
    const p = document.querySelector('#bdDlJava .bd-jv-prog');
    return JSON.stringify({
      on: p ? p.classList.contains('on') : false,
      tx: (document.getElementById('bdJvTx') || {}).textContent,
      pct: (document.getElementById('bdJvPct') || {}).textContent,
      fill: (document.getElementById('bdJvFill') || {}).style.width,
      disabled: Array.from(document.querySelectorAll('#bdDlJava [data-jdl]')).map(b => b.disabled)
    });
  })()`));
  await shot('bd-java-dl-1414.png');
  await sleep(2200);

  /* 空态：把 Java 列表清空再画一次 */
  javas.length = 0;
  cfg.javaPath = '';
  await js(`document.querySelector('#bdDlTabs [data-cat="release"]').click()`);
  await sleep(500);
  await js(`document.querySelector('#bdDlTabs [data-cat="java"]').click()`);
  await sleep(1200);
  console.log('EMPTY ' + await js(`(() => {
    const b = document.querySelector('#bdDlJava');
    return JSON.stringify({ rows: b.querySelectorAll('.bd-jv-row').length, empty: !!b.querySelector('.bd-jv-empty') });
  })()`));
  await shot('bd-java-empty-1414.png');

  /* 窄屏（1024）看看页签换行和按钮排布 */
  try { win.setContentSize(1024, 760); } catch (_) {}
  await sleep(600);
  console.log('NARROW ' + await js(`(() => {
    const b = document.querySelector('#bdDlJava');
    return JSON.stringify({
      tabs: document.querySelectorAll('#bdDlTabs .bd-segbtn').length,
      tabsH: Math.round(document.querySelector('#bdDlTabs').getBoundingClientRect().height),
      dlBtns: b.querySelectorAll('[data-jdl]').length,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1
    });
  })()`));
  await shot('bd-java-narrow-1414.png');

  console.log('DONE');
  setTimeout(() => { try { win.destroy(); } catch (_) {} app.exit(0); }, 300);
});
