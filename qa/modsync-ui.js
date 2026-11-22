/* 联机模组同步的界面流程（桩掉 IPC，只验 UI / 流程）：
 *   ① 缺模组 → 弹出清单 → 点「安装并继续」→ 有装不上的 → 显示原因 → 点「仍然继续」→ 真正加入房间
 *   ② 一个都不缺 → 直接加入，不弹任何东西
 * 用法：./node_modules/.bin/electron qa/modsync-ui.js
 * 产物：qa/out/mpsync-1-dialog.png / mpsync-2-partial.png / mpsync-3-joined.png */
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
  railPosition: 'left', theme: 'light', accentColor: '', bgMode: 'default', activeAccount: 'Steve'
};

const host = { name: 'Alex', inst: '1.21.4-Fabric', mc: '1.21.4', ld: 'Fabric', count: 5 };
const mineLight = { inst: '1.21.4-Fabric', mc: '1.21.4', ld: 'Fabric' };
const missA = { f: 'sodium-0.6.5.jar', h: 'a'.repeat(40), s: 812345, i: 'sodium', v: '0.6.5' };
const missB = { f: 'iris-1.8.0.jar', h: 'b'.repeat(40), s: 2345678, i: 'iris', v: '1.8.0' };

const ST = {
  scenario: 'missing',        /* missing | clean */
  diffCalls: 0,
  acts: [],
  installs: [],
  sends: []
};

const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, p) => { Object.assign(baseCfg, p); return Object.assign({}, baseCfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [{ id: '1.21.4-Fabric', dir: '1.21.4-Fabric', hasJson: true, loader: 'Fabric' }], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21, vendor: 'Temurin' }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4' }, versions: [{ id: '1.21.4-Fabric', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' }] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'XLC-8888-8888', friends: [{ code: 'AAA-1111-2222', name: 'Alex' }] }),
  'friends:presence': () => ({ ok: true, connected: true, status: { 'AAA-1111-2222': { online: true, lastSeen: Date.now() } } }),
  /* 第一次轮询就投递一条「房间码」信令（带房主模组清单），之后为空 */
  'friends:signal-poll': () => {
    if (!ST.delivered) {
      ST.delivered = true;
      return { ok: true, signals: [{ type: 'room', room: 'U/AAAA-BBBB-CCCC-DDDD', from: 'AAA-1111-2222', name: 'Alex', mpact: 'z1:stub' }] };
    }
    return { ok: true, signals: [] };
  },
  'friends:signal-send': (_e, p) => { ST.sends.push(p); return { ok: true }; },
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', running: true, port: 1234 }),
  'mp:start': () => ({ ok: true, port: 1234 }),
  'mp:state': () => ({ ok: true, state: { state: 'guest-ok', room: 'U/AAAA-BBBB-CCCC-DDDD', url: '10.0.0.2:25565', difficulty: 'SIMPLE' } }),
  'mp:act': (_e, p) => { ST.acts.push(p); return { ok: true, status: 200 }; },
  'mp:mod-manifest': () => ({ ok: true, wire: 'z1:stub', count: 5, mc: '1.21.4', loader: 'Fabric', instance: '1.21.4-Fabric' }),
  /* 第一次比对：缺 2 个；安装后复查：还剩 1 个（iris 没装上） */
  'mp:mods-diff': () => {
    ST.diffCalls++;
    if (ST.scenario === 'clean') return { ok: true, host, mine: mineLight, missing: [], outdated: [], same: 5 };
    if (ST.diffCalls === 1) return { ok: true, host, mine: mineLight, missing: [missA, missB], outdated: [{ host: { f: 'fabric-api-0.92.jar', v: '0.92' }, local: { name: 'fabric-api-0.90.jar', version: '0.90' } }], same: 1 };
    return { ok: true, host, mine: mineLight, missing: [missB], outdated: [], same: 2 };
  },
  'mp:mods-install': (_e, p) => {
    ST.installs.push(p);
    return { ok: true, total: 2, installed: 1, existed: 0, failed: [{ file: 'iris-1.8.0.jar', error: '下载超时' }], manual: [] };
  },
  'mp:publish-mods': () => ({ ok: true }),
  'mp:room-mods': () => ({ ok: false, error: '超时' }),
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
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    /* paintWhenInitiallyHidden：隐藏窗口也要合成新帧，否则 capturePage 永远是启动那一刻的画面 */
    show: false, frame: false, width: 1240, height: 820, paintWhenInitiallyHidden: true,
    /* offscreen：窗口不上屏也要持续合成帧，capturePage 才拿得到「现在」而不是「启动那一刻」 */
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true }
  });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2600);
  const shot = async (name) => {
    /* 隐藏窗口的合成器不推进 CSS 动画：淡入动画会停在第一帧（opacity:0），弹窗「看不见」。
       截图前统一关掉动画 / 过渡，再强制重绘一次。 */
    await js(`(() => {
      if (document.getElementById('qaNoAnim')) return true;
      const st = document.createElement('style');
      st.id = 'qaNoAnim';
      st.textContent = '*,*::before,*::after{animation:none !important;transition:none !important}';
      document.head.appendChild(st);
      return true;
    })()`);
    try { win.webContents.invalidate(); } catch (_) {}
    await sleep(350);
    const dbg = await js(`(() => {
      const m = document.getElementById('modSyncMask');
      if (!m) return 'no-mask';
      const cs = getComputedStyle(m), r = m.getBoundingClientRect();
      const inner = m.querySelector('.modal');
      const ics = inner ? getComputedStyle(inner) : null;
      return JSON.stringify({ z: cs.zIndex, op: cs.opacity, disp: cs.display, vis: cs.visibility,
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        innerOp: ics && ics.opacity, innerBg: ics && ics.backgroundColor, innerRect: inner && [Math.round(inner.getBoundingClientRect().width), Math.round(inner.getBoundingClientRect().height)],
        topAtCenter: (document.elementFromPoint(innerWidth / 2, innerHeight / 2) || {}).id || (document.elementFromPoint(innerWidth / 2, innerHeight / 2) || {}).className });
    })()`);
    log('DEBUG ' + name + ' ' + dbg);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  };
  const js = (code) => win.webContents.executeJavaScript(code, true);

  /* ---- 场景①：缺 2 个模组 ---- */
  for (let i = 0; i < 40 && !(await js('!!document.getElementById("modSyncMask")')); i++) await sleep(500);
  const shown = await js('!!document.getElementById("modSyncMask")');
  log((shown ? 'PASS ' : 'FAIL ') + '缺模组时弹出清单（modal=' + shown + '）');
  if (shown) {
    const info = await js(`(() => {
      const m = document.getElementById('modSyncMask');
      return JSON.stringify({
        rows: [...m.querySelectorAll('.mps-row')].map(r => r.dataset.f),
        title: m.querySelector('h3').textContent.trim(),
        outdated: !!m.querySelector('.mps-src')
      });
    })()`);
    log('INFO ' + info);
    const d = JSON.parse(info);
    log((d.rows.length === 2 ? 'PASS ' : 'FAIL ') + '清单列出 2 个缺失模组');
    log((d.rows.includes('iris-1.8.0.jar') ? 'PASS ' : 'FAIL ') + '清单包含 iris');
    log((/补齐/.test(d.title) ? 'PASS ' : 'FAIL ') + '标题写明要补齐');
    log((d.outdated ? 'PASS ' : 'FAIL ') + '提示「已有但版本不同」的数量');
    await shot('mpsync-1-dialog');

    /* 点「安装并继续」：桩返回部分失败 → 界面要给原因，再让用户决定 */
    await js('document.getElementById("mpsGo").click(); true');
    for (let i = 0; i < 20; i++) {
      await sleep(400);
      const left = await js('(() => { const p = document.getElementById("mpsProg"); return p && p.offsetParent !== null ? p.textContent : ""; })()');
      if (/没装上/.test(left)) break;
    }
    const prog = await js('(() => document.getElementById("mpsProg").textContent)()');
    log('INFO 进度行: ' + prog);
    log((/还有 1 个没装上/.test(prog) ? 'PASS ' : 'FAIL ') + '部分失败时有明确提示');
    const inst = ST.installs.length === 1 && (ST.installs[0].mods || []).length === 2;
    log((inst ? 'PASS ' : 'FAIL ') + '安装请求带上了 2 个缺失模组');
    await shot('mpsync-2-partial');

    /* 「仍然继续」→ 应该真的去加入房间 */
    await js('document.getElementById("mpsSkip").click(); true');
    for (let i = 0; i < 24; i++) {
      await sleep(400);
      if (ST.acts.some(a => a.action === 'guesting')) break;
    }
    const joined = ST.acts.some(a => a.action === 'guesting' && a.room === 'U/AAAA-BBBB-CCCC-DDDD');
    log((joined ? 'PASS ' : 'FAIL ') + '选择继续后真的加入了房间');
    log(((await js('!!document.getElementById("modSyncMask")')) ? 'FAIL ' : 'PASS ') + '弹窗已关闭');
    await sleep(600);
    await shot('mpsync-3-joined');
  }

  /* ---- 场景②：一个都不缺 → 不该有任何弹窗 ---- */
  ST.acts.length = 0; ST.delivered = false; ST.diffCalls = 0; ST.scenario = 'clean';
  await js('(() => { location.reload(); return true; })()');
  await sleep(3200);
  let dialog = false;
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    if (await js('!!document.getElementById("modSyncMask")')) { dialog = true; break; }
    if (ST.acts.some(a => a.action === 'guesting')) break;
  }
  log((dialog ? 'FAIL ' : 'PASS ') + '模组齐全时不弹窗');
  const joined2 = ST.acts.some(a => a.action === 'guesting');
  log((joined2 ? 'PASS ' : 'FAIL ') + '模组齐全时直接加入房间');

  const ok = lines.every(l => !l.startsWith('FAIL'));
  console.log(lines.join('\n'));
  console.log('[MPSYNC-UI] ' + (ok ? 'PASS' : 'FAIL'));
  try { fs.writeFileSync(path.join(OUT, 'modsync-ui.log'), lines.join('\n') + '\n[MPSYNC-UI] ' + (ok ? 'PASS' : 'FAIL') + '\n', 'utf8'); } catch (_) {}
  app.exit(ok ? 0 : 1);
});
