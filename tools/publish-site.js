#!/usr/bin/env node
/* 发版工具：把打包产物同步到官网目录，并生成 release.json
 *
 * 用法：
 *   node tools/publish-site.js                       # 自动读 package.json 版本
 *   node tools/publish-site.js --notes "一句话说明"    # 覆盖 release notes
 *   node tools/publish-site.js --site ../website     # 指定官网目录（默认 ../website）
 *
 * 做的事：
 *   1. 校验 dist/XLC-CE-Launcher-<ver>-portable.exe 存在
 *   2. 拷贝到 <site>/downloads/，删掉旧版本的 exe（避免每次部署几百 MB）
 *   3. 计算 size / sha256，重写 <site>/release.json（保留 history 里其它版本，替换/插入当前版本）
 *
 * release.json 是启动器内置更新源的唯一数据源（newest first），history 同时驱动官网更新日志页。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const ver = pkg.version;
const site = path.resolve(root, arg('site', path.join('..', 'website')));
const distExe = path.join(root, 'dist', 'XLC-CE-Launcher-' + ver + '-portable.exe');
if (!fs.existsSync(distExe)) {
  console.error('找不到打包产物: ' + distExe + '\n先执行 electron-builder --win');
  process.exit(1);
}

const dlDir = path.join(site, 'downloads');
fs.mkdirSync(dlDir, { recursive: true });

/* 清理旧版本 exe：官网只保留当前这一份（其它版本靠 history 记录，不再占空间） */
for (const f of fs.readdirSync(dlDir)) {
  if (/^XLC-CE-Launcher-.*\.(exe|zip)$/i.test(f) && f !== 'XLC-CE-Launcher-' + ver + '-portable.exe') {
    fs.rmSync(path.join(dlDir, f), { force: true });
    console.log('删除旧产物: downloads/' + f);
  }
}

const destExe = path.join(dlDir, 'XLC-CE-Launcher-' + ver + '-portable.exe');
fs.copyFileSync(distExe, destExe);
const buf = fs.readFileSync(destExe);
const size = buf.length;
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

/* zip 绿色版默认不上传（110 MB 会让每次部署变慢、也容易中途失败），需要时加 --with-zip */
const wantZip = argv.includes('--with-zip');
const zipSrc = path.join(root, 'dist', 'XLC-CE-Launcher-' + ver + '-green.zip');
let zipInfo = null;
if (wantZip && fs.existsSync(zipSrc)) {
  const zipDest = path.join(dlDir, 'XLC-CE-Launcher-' + ver + '-green.zip');
  fs.copyFileSync(zipSrc, zipDest);
  const zbuf = fs.readFileSync(zipDest);
  zipInfo = { size: zbuf.length, sha256: crypto.createHash('sha256').update(zbuf).digest('hex') };
}

const relFile = path.join(site, 'release.json');
let old = {};
try { old = JSON.parse(fs.readFileSync(relFile, 'utf8')); } catch (_) {}

const notes = arg('notes', '') ||
  ('修复版：装加载器 / 模组后一打开就闪退、原版基座删不掉、实例管理页没有入口，这次一起修了。');

/* 本版更新日志：作为 history 第一条；已存在同版本则替换 */
const highlights = JSON.parse(arg('highlights', 'null')) || [
  '修复 Fabric / Quilt / Forge / NeoForge 实例「一打开就闪退」：classpath 上重复的库（原版 asm-9.6 与 Fabric 的 asm-9.10.1）按官方规则合并，漏装的加载器本体也补上了',
  '新增「实例文件完整性」体检与一键修复：安装收尾、启动前、诊断页三处自动补齐缺失或截断的 jar，装不完整会直接跳到诊断页',
  '原版基座（如 26.3）标上「基座」并显示被几个实例依赖，删除时可一次连带清理，不用先删 Fabric 再删原版',
  '实例管理页补上入口：侧边栏、主页「游戏版本 → 管理实例」、导入页「当前游戏目录 → 管理实例」都能进',
  '联机前自动核对房主的模组：缺什么提示装什么，已经装好的一概不打扰',
  '浅色模式 + 自定义主题色全站统一，下载页的安装按钮重做成轻量胶囊'
];

const history = (Array.isArray(old.history) ? old.history : []).filter(h => h && h.version !== ver);
history.unshift({ version: ver, date: arg('date', new Date().toISOString().slice(0, 10)), notes, highlights });

const out = {
  version: ver,
  display: ver,
  releaseDate: history[0].date,
  file: 'XLC-CE-Launcher-' + ver + '-portable.exe',
  size,
  channel: 'stable',
  notes,
  downloads: [
    {
      name: 'XLC-CE-Launcher-' + ver + '-portable.exe',
      url: 'downloads/XLC-CE-Launcher-' + ver + '-portable.exe',
      size,
      kind: 'portable',
      sha256
    }
  ].concat(zipInfo ? [{
    name: 'XLC-CE-Launcher-' + ver + '-green.zip',
    url: 'downloads/XLC-CE-Launcher-' + ver + '-green.zip',
    size: zipInfo.size,
    kind: 'zip',
    sha256: zipInfo.sha256
  }] : []),
  history
};

fs.writeFileSync(relFile, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log('版本      : ' + ver);
console.log('便携版    : ' + (size / 1048576).toFixed(1) + ' MB  sha256 ' + sha256.slice(0, 16) + '…');
if (zipInfo) console.log('绿色版    : ' + (zipInfo.size / 1048576).toFixed(1) + ' MB  sha256 ' + zipInfo.sha256.slice(0, 16) + '…');
console.log('release   : ' + relFile);
console.log('history   : ' + history.map(h => h.version).join(' > '));
