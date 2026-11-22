/* 示例插件 · 页面逻辑（page.html）
 * 和设置页（panel.js）同一座桥：window.xlcPlugin —— info() 看身份，call() 走权限。
 * 权限没申请 / 用户没勾，call 会返回 { ok:false, error:'…' }，界面上把原因摆出来就行。 */
'use strict';

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

const $ = (s) => document.querySelector(s);
function out(msg) { $('#out').textContent = msg; }

async function main() {
  /* ① 身份：我是谁、用户给了我哪些权限。页面明暗跟随启动器。 */
  let info = null;
  try { info = await api.info(); } catch (_) {}
  if (info && info.ok) {
    $('#who').textContent = info.name + ' v' + info.version + ' · 已授权：' +
      (info.grantedLabels.join('、') || '（无）');
    document.body.classList.toggle('light', info.theme === 'light');
  } else {
    $('#who').textContent = (info && info.error) || '拿不到插件信息';
  }

  /* ② 称呼与设置页联动：设置页用 storage 存了 settings.nick，这里读同一份 */
  try {
    const saved = await host('storage.get', { key: 'settings' });
    $('#nick').textContent = (saved && saved.nick) || '玩家';
  } catch (_) { $('#nick').textContent = '玩家'; }

  /* ③ notify 权限：在启动器右下角弹提示 */
  $('#btnNotify').addEventListener('click', async () => {
    try {
      await host('notify', { text: '这是 page.html 通过 notify 权限发的提示' });
      out('提示已发出，看看启动器右下角。');
    } catch (e) { out('发不出来：' + e.message); }
  });

  /* ④ launcher 权限：读启动器基础信息 */
  $('#btnVer').addEventListener('click', async () => {
    try {
      const d = await host('launcher.info');
      out('启动器版本 ' + (d.version || '?') + ' · 游戏目录 ' + (d.gameDir || '?'));
    } catch (e) { out('读不到：' + e.message); }
  });
}

main();
