/* 主进程两个纯函数单测：tcVerCmp（内核版本比较）/ mpNormRoom（房间码规整）
 * 用法：node qa/mp-kernel-unit.js
 * 说明：不启 Electron、不联网 —— 直接从 main.js 里抠出函数体求值。
 *       这两个函数是「进别人房间 404」修复的核心：版本比错会误判内核身份，
 *       房间码规整错会把合法码改成非法码。 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const grab = (name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('main.js 里找不到 ' + name);
  /* 从函数头往后数花括号，取到配平为止 */
  const start = src.indexOf('{', i);
  let depth = 0, j = start;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) { j++; break; } }
  }
  return src.slice(i, j);
};

const code = grab('tcVerNum') + '\n' + grab('tcVerCmp') + '\n' + grab('mpNormRoom') + '\n';
const fn = new Function(code + '; return { tcVerCmp, mpNormRoom };')();

const lines = [];
let fail = 0;
const ok = (cond, name, extra) => {
  if (!cond) fail++;
  lines.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined && !cond ? '  ← ' + extra : ''));
};

/* ---- 版本比较 ---- */
ok(fn.tcVerCmp('0.4.2', '0.4.2') === 0, '同版本相等');
ok(fn.tcVerCmp('0.4.1', '0.4.2') < 0, '0.4.1 < 0.4.2');
ok(fn.tcVerCmp('0.4.2', '0.4.1') > 0, '0.4.2 > 0.4.1');
ok(fn.tcVerCmp('0.10.0', '0.9.9') > 0, '0.10.0 > 0.9.9（按数字比而非字符串）');
ok(fn.tcVerCmp('v0.4.2', '0.4.2') === 0, '带 v 前缀等价');
ok(fn.tcVerCmp('', '0.4.2') < 0, '空版本视为更旧');
ok(fn.tcVerCmp('0.4', '0.4.0') === 0, '缺位补 0');

/* ---- 房间码规整 ---- */
const good = 'U/R4RT-WNRL-Y4KN-Y1PL';
ok(fn.mpNormRoom(good) === good, '合法房间码原样返回', fn.mpNormRoom(good));
ok(fn.mpNormRoom('  u/r4rt-wnrl-y4kn-y1pl  ') === good, '小写 + 首尾空格');
ok(fn.mpNormRoom('房间码：U/R4RT-WNRL-Y4KN-Y1PL') === good, '带中文前缀', fn.mpNormRoom('房间码：U/R4RT-WNRL-Y4KN-Y1PL'));
ok(fn.mpNormRoom('U／R4RT－WNRL－Y4KN－Y1PL') === good, '全角斜杠/破折号', fn.mpNormRoom('U／R4RT－WNRL－Y4KN－Y1PL'));
ok(fn.mpNormRoom('U/R4RT WNRL Y4KN Y1PL') === good, '分段之间是空格', fn.mpNormRoom('U/R4RT WNRL Y4KN Y1PL'));
ok(fn.mpNormRoom('R4RT-WNRL-Y4KN-Y1PL') === good, '粘贴时漏了 U/ 前缀', fn.mpNormRoom('R4RT-WNRL-Y4KN-Y1PL'));
ok(fn.mpNormRoom('U/R4RTWNRLY4KNY1PL') === good, '一整串没有分隔符', fn.mpNormRoom('U/R4RTWNRLY4KNY1PL'));
ok(fn.mpNormRoom('') === '', '空串不炸');

console.log(lines.join('\n'));
console.log(fail ? '\nFAILED ' + fail + ' 项' : '\nALL PASS');
process.exit(fail ? 1 : 0);
