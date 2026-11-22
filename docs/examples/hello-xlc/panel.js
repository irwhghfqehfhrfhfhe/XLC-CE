/* ============================================================
 * XLC 插件模板：一个「插件自己的设置页」
 * ============================================================
 * 插件面板是一个**独立窗口**里的普通网页（顶层文档），它：
 *   · 看不到启动器源码，也没有 window.lmc 那种内部接口；
 *   · 不能直接读写文件、不能直连外网；
 *   · 想做什么，只能调窗口上挂着的那把桥 window.xlcPlugin，宿主按你清单里
 *     声明、用户勾选过的权限逐条放行。
 *
 * 这个模板演示的是**插件自己的设置**（清单里只申请 notify / storage / launcher）：
 *   storage.get  →  读出上次存的那份偏好（没有就返回 null）
 *   storage.set  →  存回去（存在插件自己目录的 .xlc-data.json，上限 64 KB）
 *   storage.remove → 删掉，回到默认值
 *   notify       →  保存后给用户弹一条提示
 *   launcher.info → 读启动器版本（模板顶部那行小字）
 *
 * 注意：这一份**不碰启动器设置**。要让插件改启动器设置那是另一项能力
 * （清单里声明 control 权限，对应 config.schema / get / set / reset 四个接口），
 * 而且「不能把任何东西藏起来」是启动器那边的硬红线 —— 详见开发文档 §4.3。
 *
 * 只想在浏览器里预览面板长什么样？把 window.xlcPlugin 换成一个假的 stub 即可
 * （启动器之外的浏览器里没有这把桥）。
 * ============================================================ */

const api = window.xlcPlugin || {
  /* 离线预览用的兜底：不连启动器时界面也能出来，方便调样式 */
  info: async () => ({ ok: false, error: '离线预览：没有启动器' }),
  call: async () => ({ ok: false, error: '离线预览：没有启动器' })
};

/* 调用宿主接口。注意它**不会抛异常**：成功失败都回一个 {ok, data?, error?} */
async function host(method, params) {
  const r = await api.call(method, params);
  if (!r || !r.ok) throw new Error((r && r.error) || '调用被拒绝');
  return r.data;
}

const $ = (sel) => document.querySelector(sel);
function log(s) { $('#out').textContent = s; }

/* 插件自己的设置：默认值写在一处，读出来缺哪个就补哪个——
   以后加新选项，老用户存的那份也能直接用 */
const DEFAULTS = { nick: '玩家', theme: 'auto', toastOnSave: true, showVersion: true };
const KEY = 'settings';

let settings = Object.assign({}, DEFAULTS);
let hostTheme = 'dark';

/* 主题：默认跟随启动器；用户自己选了就按他的来 */
function paintTheme() {
  const t = settings.theme === 'auto' ? hostTheme : settings.theme;
  document.body.classList.toggle('light', t === 'light');
}

function paintForm() {
  $('#stNick').value = settings.nick;
  $('#stTheme').value = settings.theme;
  $('#stToast').checked = !!settings.toastOnSave;
  $('#stShowVer').checked = !!settings.showVersion;
  paintTheme();
}

async function load() {
  const saved = await host('storage.get', { key: KEY });   /* 没有就返回 null */
  settings = Object.assign({}, DEFAULTS, saved || {});
  paintForm();
  log(saved ? '已读出插件自己保存的设置：\n' + JSON.stringify(saved, null, 2)
            : '这个插件还没有存过设置，现在显示的是默认值。');
}

async function boot() {
  /* info() 给你插件自己的身份 / 主题 / 已授权的权限 —— 不用自报家门，宿主按窗口认定 */
  const info = await api.info();
  if (!info || !info.ok) { log('拿不到插件信息：' + ((info && info.error) || '未知错误')); return; }
  hostTheme = info.theme === 'light' ? 'light' : 'dark';
  $('#who').textContent = info.name + ' v' + info.version + ' · ' + info.id +
    ' · 宿主接口 v' + (info.apiVersion || 1);

  try {
    await load();
  } catch (e) { log('读设置失败：' + e.message); return; }

  /* 读启动器版本（launcher 权限）。读不到也不影响设置页本身 —— 设置是插件自己的 */
  try {
    const li = await host('launcher.info');
    if (settings.showVersion) $('#hostVer').textContent = '启动器版本：' + li.version + ' · 游戏目录：' + li.gameDir;
    $('#hostVer').dataset.version = li.version;
  } catch (e) { $('#hostVer').textContent = ''; }
}

function currentForm() {
  return {
    nick: ($('#stNick').value || '').trim() || DEFAULTS.nick,
    theme: $('#stTheme').value,
    toastOnSave: $('#stToast').checked,
    showVersion: $('#stShowVer').checked
  };
}

$('#btnSaveSt').addEventListener('click', async () => {
  const next = currentForm();
  try {
    const bytes = await host('storage.set', { key: KEY, value: next });   /* 返回当前总字节数 */
    settings = next;
    paintForm();
    log('已保存到插件自己的存储（当前共 ' + bytes + ' 字节）：\n' + JSON.stringify(next, null, 2));
    if (next.toastOnSave) {
      /* notify 是 fire-and-forget：被授权了才会弹，弹不弹都不影响保存结果 */
      try { await host('notify', { text: '「示例插件」的设置已保存', kind: 'ok' }); } catch (_) {}
    }
  } catch (e) { log('保存失败：' + e.message); }
});

$('#btnResetSt').addEventListener('click', async () => {
  try {
    await host('storage.remove', { key: KEY });
    settings = Object.assign({}, DEFAULTS);
    paintForm();
    log('已恢复默认设置（插件存储里那份已删掉）。');
  } catch (e) { log('恢复默认失败：' + e.message); }
});

$('#btnPing').addEventListener('click', async () => {
  try {
    await host('notify', { text: '你好，' + currentForm().nick + '！这是一条来自插件的提示。', kind: 'ok' });
    log('已请求启动器弹提示（toast 在启动器窗口右下角）。');
  } catch (e) { log('弹提示被拒绝：' + e.message); }
});

boot();
