const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path'); const fs = require('fs');
const ROOT = path.join(__dirname, '..');
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu');
const ACCENT = String(process.argv[2] || ''); const THEME = String(process.argv[3] || 'light');
const baseCfg = { username:'Steve', theme:THEME, accentColor:ACCENT, railPosition:'left', appVersion:'1.2.0', autoCheckUpdate:false, bgMode:'default' };
const stub = { 'config:get':()=>Object.assign({},baseCfg), 'config:save':(_e,p)=>{Object.assign(baseCfg,p);return Object.assign({},baseCfg);}, 'dir:scan':()=>({ok:true,versions:[],broken:[]}), 'java:detect':()=>({ok:true,javas:[],major:0}), 'manifest:get':()=>({ok:true,via:'bmclapi',manifest:{latest:{release:'26.3',snapshot:'26.4'},versions:[{id:'26.3',type:'release',releaseTime:'2026-10-05T10:00:00+00:00'}]}}), 'sys:meminfo':()=>({ok:true,total:32,used:12}), 'friends:get':()=>({ok:true,code:'X',friends:[]}), 'friends:presence':()=>({ok:true,online:[]}), 'friends:signal-poll':()=>({ok:true,items:[]}), 'mp:status':()=>({ok:true,installed:false}), 'update:check':()=>({ok:true,current:'1.2.0',latest:'1.2.0',hasUpdate:false}), 'update:cached':()=>({ok:false}), 'update:changelog':()=>({ok:true,entry:{groups:[],items:[]},list:[],unseen:false}), 'account:list':()=>({ok:true,accounts:[],active:''}), 'account:ms-app-info':()=>({ok:true,builtin:true,ready:true}), 'saves:list':()=>({ok:true,saves:[]}), 'plugin:list':()=>({ok:true,items:[]}), 'personalize:get-bg':()=>({ok:false}) };
for (const k of Object.keys(stub)) ipcMain.handle(k, (...a)=>stub[k](...a));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show:false, frame:false, width:1240, height:820, webPreferences:{ preload:path.join(ROOT,'preload.js'), contextIsolation:true, nodeIntegration:false, sandbox:false } });
  await win.loadFile(path.join(ROOT,'src','index.html'));
  await new Promise(r=>setTimeout(r,2600));
  const out = await win.webContents.executeJavaScript(`(() => {
    const body = document.body, cs = getComputedStyle(body);
    const fab = document.querySelector('.play-fab'), css = fab ? getComputedStyle(fab) : null;
    const btn = document.querySelector('#page-settings .btn.primary');
    return JSON.stringify({
      theme: body.classList.contains('light-bg') ? 'light' : 'dark',
      acc: cs.getPropertyValue('--acc').trim(),
      acc2: cs.getPropertyValue('--acc2').trim(),
      accSolid: cs.getPropertyValue('--acc-solid').trim() || '(unset)',
      onAcc: cs.getPropertyValue('--on-acc').trim(),
      grad: cs.getPropertyValue('--grad').trim(),
      fabBgImg: css ? css.backgroundImage : 'n/a',
      fabBgColor: css ? css.backgroundColor : 'n/a',
      fabColor: css ? css.color : 'n/a'
    });
  })()`, true);
  console.log(out);
  app.quit();
});
