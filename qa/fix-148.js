/* 1.4.8 自检整改的验收：Esc / 房间码 / 联机落点 / 模组核对弹窗材质
 * 用法：env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/fix-148.js
 * 产物：qa/out/fix-148-mps-bd.png（基岩版模组核对弹窗）、fix-148-invite.png（同意邀请后的落点）
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('mute-audio');

const VERSION = '1.4.8';
const cfg = {
  username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X',
  appVersion: VERSION, autoCheckUpdate: false, seenVersion: VERSION,
  railPosition: 'left', theme: 'bedrock', accentColor: '', bgMode: 'default',
  activeAccount: 'Steve', lastVersion: '1.21.4-fabric', startPage: 'home',
  railOrder: [], railHidden: [], uiSound: false, launcherVisibility: 'keep',
  forceChinese: true, forceIsolate: 'auto', defaultVersion: ''
};

const host = { name: 'Alex', inst: '1.21.4-Fabric', mc: '1.21.4', ld: 'Fabric', count: 5 };
const mine = { inst: '1.21.4-Fabric', mc: '1.21.4', ld: 'Fabric' };
const missA = { f: 'sodium-0.6.5.jar', h: 'a'.repeat(40), s: 812345, i: 'sodium', v: '0.6.5' };
const missB = { f: 'iris-1.8.0.jar', h: 'b'.repeat(40), s: 2345678, i: 'iris', v: '1.8.0' };
const missC = { f: 'lithium-0.14.3.jar', h: 'c'.repeat(40), s: 634211, i: 'lithium', v: '0.14.3' };

const sends = [];
const stub = {
  'config:get': () => Object.assign({}, cfg),
  'config:save': (_e, p) => { Object.assign(cfg, p); return Object.assign({}, cfg); },
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, broken: [], versions: [{ id: '1.21.4-fabric', dir: '1.21.4-fabric', hasJson: true, loader: 'Fabric', loaderVer: '0.20.1' }],
    saves: [{ name: '新的世界', levelName: '新的世界', instance: '1.21.4-fabric', lastPlayed: 1794900000000 }] }),
  'java:list': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21 }], major: 21 }),
  'java:detect': () => ({ ok: true, javas: [{ path: 'C:\\Java\\bin\\java.exe', major: 21 }], major: 21 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '1.21.4', snapshot: '26.4' }, versions: [{ id: '1.21.4', type: 'release', releaseTime: '2026-10-05T10:00:00+00:00' }] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'update:check': () => ({ ok: true, current: VERSION, latest: VERSION, hasUpdate: false }),
  'update:cached': () => null,
  'update:changelog': () => ({ ok: true, entry: { groups: [], items: [] }, list: [], unseen: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve', type: 'offline', model: 'classic' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] }),
  'plugin:list': () => ({ ok: true, items: [] }),
  'friends:get': () => ({ ok: true, code: 'ABCD-EFGH-JKLM', friends: [{ code: 'WXYZ-2345-6789', name: 'Alex' }] }),
  'friends:presence': () => ({ ok: true, connected: true, status: { 'WXYZ-2345-6789': { online: true, lastSeen: Date.now() } } }),
  'friends:signal-send': (_e, p) => { sends.push(p); return { ok: true }; },
  'friends:signal-poll': () => ({ ok: true, signals: [] }),
  'mp:status': () => ({ ok: true, installed: true, version: '0.4.2', latest: '0.4.2', outdated: false, running: true, port: 1234, liveVersion: '0.4.2', mismatch: false }),
  'mp:kernel-check': () => ({ ok: true, version: '0.4.2', latest: '0.4.2', outdated: false }),
  'mp:state': () => ({ ok: true, state: { state: 'waiting' } }),
  'mp:start': () => ({ ok: true, port: 1234 }),
  'mp:act': () => ({ ok: true, status: 200 }),
  'mp:download': () => ({ ok: true }),
  'mp:publish-mods': () => ({ ok: true }),
  'mp:room-mods': () => ({ ok: false, error: 'no' }),
  'mp:mods-diff': () => ({ ok: true, host, mine, missing: [missA, missB, missC], outdated: [], same: 1 }),
  'mp:mods-install': () => ({ ok: true, total: 3, installed: 3, existed: 0, failed: [], manual: [] }),
  'version:info': () => ({ ok: true, id: '1.21.4-fabric', mcVer: '1.21.4', loader: 'Fabric', loaderVer: '0.20.1' }),
  'diag:launcher': () => ({ ok: true, crashes: [], diagDir: 'D:\\X' }),
  'diag:game': () => ({ ok: true, diag: { found: false, note: '无', rules: [], modsInvolved: [], integrity: null } }),
  'diag:integrity': () => ({ ok: true, integrity: { ok: true, instance: '', total: 0, problems: [], deep: false } }),
  'launch:start': () => ({ started: false, error: 'QA' }), 'launch:stop': () => ({ ok: true }), 'ui:trace': () => ({ ok: true })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lines = [];
const ok = (c, n, e) => { const l = (c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''); lines.push(l); console.log(l); return c; };

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, frame: false, width: 1280, height: 880, paintWhenInitiallyHidden: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true } });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2600);
  const js = (c) => win.webContents.executeJavaScript(c, true);
  const shot = async (n) => {
    await js(`(() => { if (document.getElementById('qaNoAnim')) return true; const st=document.createElement('style'); st.id='qaNoAnim'; st.textContent='*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.appendChild(st); return true; })()`);
    try { win.webContents.invalidate(); } catch (_) {}
    await sleep(450);
    fs.writeFileSync(path.join(OUT, n + '.png'), (await win.webContents.capturePage()).toPNG());
  };

  await js(`(() => { window.__e=[]; window.addEventListener('error', e => window.__e.push(e.message + ' @' + (e.filename||'').split('/').pop() + ':' + e.lineno)); return true; })()`);
  const escKey = async () => { await js(`(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return true; })()`); await sleep(350); };
  const errs = async () => JSON.parse(await js(`JSON.stringify(window.__e)`));

  /* ---- 1. Esc 在主菜单 / 下载页 / 诊断页都不许抛异常 ---- */
  ok((await js(`document.body.classList.contains('bedrock-mode')`)), '启动即在基岩版主菜单');
  await escKey();
  await js(`(() => { document.getElementById('bdDownload').click(); return true; })()`);
  await sleep(1200);
  const onDl = await js(`(document.querySelector('.page.active')||{}).id`);
  await escKey();
  const backFromDl = await js(`(document.querySelector('.page.active')||{}).id`);
  ok(onDl === 'page-bedrock-dl' && backFromDl === 'page-bedrock', '下载页按 Esc 回主菜单', onDl + ' → ' + backFromDl);
  await js(`(() => { document.getElementById('bdSettings').click(); return true; })()`);
  await sleep(800);
  await js(`(() => { const b=document.querySelector('#bdSheet .bd-tab[data-tab="diag"]'); if(b) b.click(); return true; })()`);
  await sleep(700);
  await js(`(() => { const b=document.querySelector('#bdSheet [data-bd-close], #bdSheet .bd-x'); if(b) b.click(); else BEDROCK.close(); return true; })()`);
  await sleep(400);
  await js(`(() => { const p=document.getElementById('page-bedrock-diag'); if(p) gotoPage('bedrock-diag'); return true; })()`);
  await sleep(900);
  const onDiag = await js(`(document.querySelector('.page.active')||{}).id`);
  await escKey();
  const backFromDiag = await js(`(document.querySelector('.page.active')||{}).id`);
  ok(onDiag === 'page-bedrock-diag' && backFromDiag === 'page-bedrock', '诊断页按 Esc 回主菜单', onDiag + ' → ' + backFromDiag);
  const e1 = await errs();
  ok(e1.length === 0, 'Esc 全程无 JS 异常', JSON.stringify(e1));

  /* ---- 2. 房间码容错 ---- */
  const cases = ['U/R4RT-WNRL-Y4KN-Y1PL', 'u/r4rt-wnrl-y4kn-y1pl', 'R4RT-WNRL-Y4KN-Y1PL',
    'U/R4RTWNRLY4KNY1PL', 'U／R4RT－WNRL－Y4KN－Y1PL', '房间码：U/R4RT-WNRL-Y4KN-Y1PL', 'U/R4RT WNRL Y4KN Y1PL'];
  const parsed = JSON.parse(await js(`JSON.stringify(${JSON.stringify(cases)}.map(v => mpRoomCodeValid(v)))`));
  ok(parsed.every(x => x === 'U/R4RT-WNRL-Y4KN-Y1PL'), '7 种粘法都规整成标准房间码', parsed.join(' | '));

  /* ---- 3. 同意邀请后留在基岩版（不再掉回普通页） ---- */
  await js(`(() => { BEDROCK.invite({ type:'invite', from:'WXYZ-2345-6789', name:'Alex', inviteId:'t1' }); return true; })()`);
  await sleep(800);
  await js(`(() => { const b=Array.from(document.querySelectorAll('#bdSheet .bd-btn')).find(x=>/同意/.test(x.textContent)); if(b) b.click(); return true; })()`);
  await sleep(1500);
  const land = await js(`JSON.stringify({ body: document.body.className, page: (document.querySelector('.page.active')||{}).id, sheet: !!document.querySelector('#bdRoot.on'), rail: getComputedStyle(document.getElementById('rail')).display })`);
  const L = JSON.parse(land);
  ok(L.page === 'page-bedrock' && /bd-home/.test(L.body) && L.sheet && L.rail === 'none', '同意邀请后仍停在基岩版主菜单（联机弹层已打开）', land);
  ok(sends.some(s => s.payload && s.payload.type === 'accept'), 'accept 信令已发出', JSON.stringify(sends.map(s => s.payload && s.payload.type)));
  const kernelTx = await js(`(() => { const t=document.getElementById('mpKernelTx'); return t ? t.textContent : 'NO'; })()`);
  ok(/联机内核/.test(kernelTx), '联机弹层里的状态行还在（借来的 DOM 没丢）', kernelTx);
  await shot('fix-148-invite');
  await js(`(() => { BEDROCK.close(); return true; })()`);
  await sleep(500);

  /* ---- 4. 模组核对弹窗：基岩版物料 ---- */
  await js(`(() => { window.mpSyncHostMods('z1:qa', 'Alex'); return true; })()`);
  for (let i = 0; i < 30 && !(await js(`!!document.getElementById('modSyncMask')`)); i++) await sleep(400);
  const shown = await js(`!!document.getElementById('modSyncMask')`);
  ok(shown, '模组核对弹窗已弹出');
  if (shown) {
    const style = await js(`(() => {
      const m = document.getElementById('modSyncMask');
      const d = m.querySelector('.modal');
      const b = m.querySelector('#mpsGo');
      const cs = getComputedStyle(d), bs = getComputedStyle(b);
      return JSON.stringify({ cls: m.className, bg: cs.backgroundColor, radius: cs.borderRadius, color: cs.color,
        btn: bs.backgroundColor, btnRadius: bs.borderRadius, rows: m.querySelectorAll('.mps-row').length });
    })()`);
    const S2 = JSON.parse(style);
    ok(/mps-bd/.test(S2.cls), '弹窗带 .mps-bd（基岩版材质）', S2.cls);
    ok(S2.bg === 'rgb(198, 198, 198)' && S2.radius === '0px' && S2.color === 'rgb(27, 27, 27)', '石块灰卡片 + 直角 + 深色字', S2.bg + ' / ' + S2.radius + ' / ' + S2.color);
    ok(S2.btnRadius === '0px', '按钮也是直角', S2.btnRadius);
    ok(S2.rows === 3, '三行缺失模组照常列出', String(S2.rows));
    await shot('fix-148-mps-bd');
    await js(`(() => { const b=document.getElementById('mpsCancel'); if(b) b.click(); return true; })()`);
  }

  /* ---- 5. 普通模式下弹窗保持原样（不能被 .mps-bd 波及） ---- */
  await js(`(() => { BEDROCK.setOpt('theme','dark'); return true; })()`);
  await sleep(1200);
  await js(`(() => { window.mpSyncHostMods('z1:qa2', 'Alex'); return true; })()`);
  for (let i = 0; i < 30 && !(await js(`!!document.getElementById('modSyncMask')`)); i++) await sleep(400);
  const darkStyle = await js(`(() => { const m=document.getElementById('modSyncMask'); if(!m) return 'NO'; const d=m.querySelector('.modal'); const cs=getComputedStyle(d); return JSON.stringify({ cls:m.className, bg:cs.backgroundColor, radius:cs.borderRadius }); })()`);
  const D = JSON.parse(darkStyle);
  ok(!/mps-bd/.test(D.cls) && D.radius !== '0px', '普通模式弹窗仍是原来的深色圆角卡片', darkStyle);
  await js(`(() => { const b=document.getElementById('mpsCancel'); if(b) b.click(); return true; })()`);

  const e2 = await errs();
  ok(e2.length === 0, '整个过程无未捕获异常', JSON.stringify(e2));
  fs.writeFileSync(path.join(OUT, 'fix-148.log'), lines.join('\n'), 'utf8');
  const fails = lines.filter(l => l.startsWith('FAIL')).length;
  console.log('\n' + (fails ? ('FAILED ' + fails) : 'ALL PASS') + ' (' + lines.length + ' 项)');
  app.exit(0);
});
