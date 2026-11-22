/* QA 脚本的窗口可见性开关。
 *
 * 为什么要有这个文件：这些脚本是靠「程序化点击」驱动界面的（切主题、切侧栏四方向…），
 * 以前窗口一律 show:true，运行时用户屏幕上就会出现一个自己乱点乱换的窗口，
 * 很像产品出了 bug。现在默认隐藏，只有真的要看图 / 录屏时再 QA_SHOW=1。
 *
 * 用法：QA_SHOW=1 env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron qa/rail-restore.js
 */
const fs = require('fs');

const QA_SHOW = process.env.QA_SHOW === '1';

/* 隐藏窗口时 capturePage 在 Windows 上拿不到有效像素，干脆跳过写盘 */
async function shotFile(win, file) {
  if (!QA_SHOW) return null;
  try {
    const buf = (await win.webContents.capturePage()).toPNG();
    fs.writeFileSync(file, buf);
    return buf;
  } catch (_) {
    return null;
  }
}

module.exports = { QA_SHOW, shotFile };
