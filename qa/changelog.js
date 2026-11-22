/* 验证首次打开公告：新文案 + 无历史版本 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const { QA_SHOW, shotFile } = require('./_vis'); /* 默认隐藏窗口，QA_SHOW=1 才弹出来看图 */

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('in-process-gpu');

const baseCfg = { username: 'Steve', mem: 8, memAuto: true, source: 'bmclapi', gameDir: 'D:\\X', appVersion: '1.2-rc1', autoCheckUpdate: false, seenVersion: '', railPosition: 'left' };
const stub = {
  'config:get': () => Object.assign({}, baseCfg),
  'config:save': (_e, patch) => { Object.assign(baseCfg, patch); return Object.assign({}, baseCfg); },
  'update:changelog': () => ({
    ok: true,
    current: '1.2-rc1',
    entry: { version: '1.2-rc1', date: '2026-10-23', tag: '1.2 候选版', notice: '本产品为独立的产品，与正式版无关。出现问题或 bug 就联系这个邮箱：qsh_689@qq.com，或是直接在抖音搜索社会边 Studio。', groups: [] },
    list: [
      { version: '1.2-rc1', date: '2026-10-23' },
      { version: '1.2-pre1', date: '2026-10-20' },
      { version: '1.2-snapshot3', date: '2026-10-18' }
    ],
    unseen: true
  }),
  'update:seen': () => ({ ok: true, version: '1.2-rc1' }),
  'personalize:get-bg': () => ({ ok: false }),
  'dir:scan': () => ({ ok: true, versions: [], broken: [] }),
  'java:detect': () => ({ ok: true, javas: [], major: 0 }),
  'manifest:get': () => ({ ok: true, via: 'bmclapi', manifest: { latest: { release: '26.3', snapshot: '26.4-snapshot-2' }, versions: [] } }),
  'sys:meminfo': () => ({ ok: true, total: 32, used: 12 }),
  'friends:get': () => ({ ok: true, code: 'X', friends: [] }),
  'friends:presence': () => ({ ok: true, online: [] }),
  'friends:signal-poll': () => ({ ok: true, items: [] }),
  'mp:status': () => ({ ok: true, installed: false }),
  'update:check': () => ({ ok: true, current: '1.2-rc1', latest: '1.2-rc1', hasUpdate: false }),
  'update:cached': () => ({ ok: false }),
  'account:list': () => ({ ok: true, accounts: [{ name: 'Steve' }], active: 'Steve' }),
  'account:ms-app-info': () => ({ ok: true, builtin: true, ready: true }),
  'saves:list': () => ({ ok: true, saves: [] }),
  'modrinth:search': () => ({ ok: true, total: 0, hits: [] })
};
for (const ch of Object.keys(stub)) ipcMain.handle(ch, (...a) => stub[ch](...a));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: QA_SHOW, width: 1360, height: 940, webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await sleep(2500);

  // 手动触发公告（模拟首次打开）
  await win.webContents.executeJavaScript(`showChangelog(); true`, true);
  await sleep(600);

  const html = await win.webContents.executeJavaScript(`(() => {
    const box = document.getElementById('modalBox');
    return JSON.stringify({
      hasNotice: box.innerHTML.includes('本产品为独立的产品'),
      hasEmail: box.innerHTML.includes('qsh_689@qq.com'),
      hasDouyin: box.innerHTML.includes('社会边 Studio'),
      hasNoHistory: box.innerHTML.includes('无历史版本'),
      hasOldHistory: box.innerHTML.includes('1.2-pre1'),
      fullText: box.innerText.slice(0, 200)
    });
  })()`, true);
  console.log('CHANGELOG ' + html);
  await shotFile(win, path.join(OUT, 'changelog.png'));
  console.log('DONE');
  app.exit(0);
});
