/* 真实联网验证：启动器自更新源 → 官网 release.json */
const { app } = require('electron');
const path = require('path');
app.whenReady().then(async () => {
  require(path.join(__dirname, '..', 'main.js'));
  const { ipcMain } = require('electron');
  const h = ipcMain._invokeHandlers.get('update:check');
  try {
    const r = await h(null, {});
    console.log('UPDATE-LIVE', JSON.stringify({
      ok: r.ok, current: r.current, latest: r.latest, hasUpdate: r.hasUpdate,
      downloads: (r.downloads || []).map(d => d.url), error: r.error || ''
    }));
  } catch (e) { console.log('UPDATE-LIVE ERR', e.message); }
  setTimeout(() => app.exit(0), 500);
});
