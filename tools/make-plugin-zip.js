/* 把 docs/examples/hello-xlc 打成交付用的插件包。
 * 运行：node tools/make-plugin-zip.js [输出路径...]
 * 不传输出路径时同时写 docs/hello-xlc.zip 与桌面交付副本。
 *
 * 用仓库自己的 zipio.buildZip：插件导入走的是同一个实现，
 * 这样「我们发的示例包」和「启动器认的包」不会因为压缩实现不同而出现诡异差异。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { buildZip } = require('../zipio');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'examples', 'hello-xlc');
const NAMES = ['plugin.json', 'panel.html', 'panel.js', 'panel.css',
  'page.html', 'page.js', 'page.css', 'Images/Logo.png', 'README.md'];
const DEFAULTS = [
  path.join(ROOT, 'docs', 'hello-xlc.zip'),
  path.join('D:', '桌面', '插件制作图文', '示例插件（可直接导入）.zip')
];

const files = NAMES.map((n) => {
  const p = path.join(SRC, n);
  if (!fs.existsSync(p)) throw new Error('缺少文件: ' + p);
  return { name: n, data: fs.readFileSync(p) };
});
const buf = buildZip(files);

const outs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS;
for (const out of outs) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log('写入 ' + out + '（' + buf.length + ' B，' + files.length + ' 个文件）');
}
