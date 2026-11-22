/* 把 PCL2（Plain Craft Launcher 2）内置的 MC 百科中文名数据库转换成 XLC 可用的 JSON。
 *
 * 数据来源：PCL2 开源仓库 PCLCS/Resource/WikiEntries.txt
 *           https://github.com/Meloong-Git/PCL
 *           （PCL 采用《PCL 分发有限许可》+《PCL 存储库合理使用指南》，见仓库 LICENCE 文件；
 *             按指南的「轻度使用」条款处理：给出署名、不与 PCL 混淆）
 *
 * 原格式（由 PCLCS/Resource/WikiEntry.cs 的解析逻辑确定）：
 *   文件 = 若干数据行 + 最后一行（浏览量索引）
 *   每行 = 若干条目，用 ¨ (U+00A8) 分隔
 *   每条目 = "slugs|中文名"
 *     slugs 写法：
 *       "abc"        → 仅 CurseForge slug
 *       "abc@"       → CurseForge + Modrinth 同 slug
 *       "@abc"       → 仅 Modrinth slug
 *       "cf@mr"      → CurseForge=cf, Modrinth=mr
 *     中文名里的 "*" → 替换成 " (英文名)"，英文名由 slug 转换（连字符→空格、首字母大写）
 *
 * 用法：node tools/convert-pcl-wiki.js <WikiEntries.txt 路径>
 * 产出：data/mod-zh-db-pcl.json  { entries: { slug: "中文名" }, count, source }
 */
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('用法：node tools/convert-pcl-wiki.js <WikiEntries.txt 路径>');
  process.exit(1);
}

const text = fs.readFileSync(src, 'utf8');
const lines = text.split(/\r?\n/);
if (lines.length < 2) { console.error('文件内容异常'); process.exit(1); }

/* 最后一行是浏览量索引，数据行是它前面的所有行 */
const dataLines = lines.slice(0, -1);

function capitalizeWords(slug) {
  return String(slug).split(/[\s-]+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const entries = {};      /* slug(小写) → 中文名 */
const cfOnly = {};       /* CurseForge 专属 slug */
let total = 0, skipped = 0, starFixed = 0;

for (const line of dataLines) {
  if (!line) continue;
  /* 每行可含多个条目，用 ¨ 分隔 */
  for (const raw of line.split('\u00a8')) {
    const piece = raw.trim();
    if (!piece) continue;
    const parts = piece.split('|');
    const slugsPart = parts[0];
    if (!slugsPart) { skipped++; continue; }

    let cf = '', mr = '';
    if (slugsPart.startsWith('@')) {
      mr = slugsPart.slice(1);
    } else if (slugsPart.endsWith('@')) {
      cf = slugsPart.slice(0, -1);
      mr = cf;
    } else if (slugsPart.includes('@')) {
      const sp = slugsPart.split('@');
      cf = sp[0]; mr = sp[1];
    } else {
      cf = slugsPart;
    }

    let zh = parts.length >= 2 ? parts[parts.length - 1] : '';
    if (!zh) { skipped++; continue; }
    zh = zh.trim();
    if (!zh) { skipped++; continue; }

    /* "*" → " (英文名)"，英文名取自 slug */
    if (zh.includes('*')) {
      const base = (mr || cf || '').replace(/-/g, ' ');
      zh = zh.replace(/\*/g, ' (' + capitalizeWords(base) + ')');
      starFixed++;
    }

    /* 同一个中文名挂到该条目的所有 slug 上（Modrinth 与 CurseForge 都要能查到） */
    for (const s of [mr, cf]) {
      const k = String(s || '').toLowerCase().trim();
      if (!k) continue;
      if (!entries[k]) { entries[k] = zh; total++; }
      if (s === cf && !mr && !cfOnly[k]) cfOnly[k] = 1;
    }
  }
}

const out = {
  _note: '由 PCL2 内置 MC 百科数据库（PCLCS/Resource/WikiEntries.txt）转换而来，仅用于模组中文名显示与中文搜索。',
  _source: 'https://github.com/Meloong-Git/PCL（《PCL 分发有限许可》+《PCL 存储库合理使用指南》，按轻度使用条款署名）',
  _generatedAt: new Date().toISOString(),
  count: total,
  entries
};

const OUT = path.join(__dirname, '..', 'data', 'mod-zh-db-pcl.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));

console.log('[convert] 解析完成');
console.log('  产出条目: ' + total + ' 个 slug → 中文名');
console.log('  含 * 自动补英文名: ' + starFixed + ' 条');
console.log('  跳过（无中文名）: ' + skipped + ' 条');
console.log('  输出: ' + OUT + '  (' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');

/* 抽样验证几个知名模组 */
const probe = ['sodium', 'jei', 'create', 'journeymap', 'xaeros-minimap', 'twilightforest',
  'iris', 'modmenu', 'cloth-config', 'appliedenergistics2', 'mekanism', 'farmers-delight',
  'alexsmobs', 'waystones', 'lithium', 'ferritecore'];
console.log('\n抽样（XLC 内置库对照）：');
for (const p of probe) {
  console.log('  ' + p.padEnd(24) + ' → ' + (entries[p] || '（未收录）'));
}
