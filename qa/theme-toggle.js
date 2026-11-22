/* 运行中来回切主题 / 改主题色：确认变量不会残留（浅色那套值不该漏到深色里） */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ROOT = path.join(__dirname, '..');
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu');
const baseCfg = { username:'Steve', theme:'light', accentColor:'#3b82f6', railPosition:'left', appVersion:'1.2.0', autoCheckUpdate:false, bgMode:'default' };
const stub = { 'config:get':()=>Object.assign({},baseCfg), 'config:save':(_e,p)=>{Object.assign(baseCfg,p);return Object.assign({},baseCfg);}, 'dir:scan':()=>({ok:true,versions:[],broken:[]}), 'java:detect':()=>({ok:true,javas:[],major:0}), 'manifest:get':()=>({ok:true,via:'bmclapi',manifest:{latest:{release:'26.3',snapshot:'26.4'},versions:[]}}), 'sys:meminfo':()=>({ok:true,total:32,used:12}), 'friends:get':()=>({ok:true,code:'X',friends:[]}), 'friends:presence':()=>({ok:true,online:[]}), 'friends:signal-poll':()=>({ok:true,items:[]}), 'mp:status':()=>({ok:true,installed:false}), 'update:check':()=>({ok:true,current:'1.2.0',latest:'1.2.0',hasUpdate:false}), 'update:cached':()=>({ok:false}), 'update:changelog':()=>({ok:true,entry:{groups:[],items:[]},list:[],unseen:false}), 'account:list':()=>({ok:true,accounts:[],active:''}), 'account:ms-app-info':()=>({ok:true,builtin:true,ready:true}), 'saves:list':()=>({ok:true,saves:[]}), 'plugin:list':()=>({ok:true,items:[]}), 'personalize:get-bg':()=>({ok:false}) };
for (const k of Object.keys(stub)) ipcMain.handle(k, (...a)=>stub[k](...a));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show:false, frame:false, width:1240, height:820, webPreferences:{ preload:path.join(ROOT,'preload.js'), contextIsolation:true, nodeIntegration:false, sandbox:false } });
  await win.loadFile(path.join(ROOT,'src','index.html'));
  await sleep(2600);
  await win.webContents.executeJavaScript(`(() => { document.querySelector('.rail-btn[data-page="settings"]').click(); return true; })()`, true);
  await sleep(1200);
  const dump = async (label) => {
    const r = await win.webContents.executeJavaScript(`(() => {
      const cs = getComputedStyle(document.body);
      const btn = document.querySelector('#page-personal .btn.primary');
      const bcs = btn ? getComputedStyle(btn) : null;
      return JSON.stringify({ label:'${label}', light: document.body.classList.contains('light-bg'),
        acc: cs.getPropertyValue('--acc').trim(), acc2: cs.getPropertyValue('--acc2').trim(),
        solid: cs.getPropertyValue('--acc-solid').trim() || '(unset)', on: cs.getPropertyValue('--on-acc').trim(),
        grad: cs.getPropertyValue('--grad').trim().slice(0,64),
        btnBg: bcs ? (bcs.backgroundColor + ' | ' + bcs.color) : 'n/a' });
    })()`, true);
    console.log(r);
  };
  const click = async (sel) => { await win.webContents.executeJavaScript(`(() => { const e = document.querySelector('${sel}'); if (e) e.click(); return true; })()`, true); await sleep(700); };
  await dump('light+blue');
  await click('#themeGrid .theme-opt[data-theme="dark"]');
  await dump('dark+blue');
  await click('#themeGrid .theme-opt[data-theme="light"]');
  await dump('light+blue-again');
  await click('#accentSwatches .swatch[data-c=""]');   /* 打开取色器不算，改用预设重置 */
  await click('#btnAccentReset');
  await dump('light+default');
  await click('#themeGrid .theme-opt[data-theme="dark"]');
  await dump('dark+default');
  app.quit();
});
