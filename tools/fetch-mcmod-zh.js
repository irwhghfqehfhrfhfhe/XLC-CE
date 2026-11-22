/* 从 mcmod.cn（PCL 使用的 McMod Wiki）抓取模组中文名，生成 data/mod-zh-db.json 的补充数据
 * 用法：node tools/fetch-mcmod-zh.js [--limit=800]
 * 原理：mcmod 搜索页 https://search.mcmod.cn/s?key=<英文名> 的搜索结果里，
 *       条目标题形如「钠 (Sodium)」「[RSO] Reese的钠视频界面 (Reese's Sodium Options)」
 *       → 提取「中文名」与括号里的英文名，作为 中文名↔英文名 映射。
 * 产出：tools/out/mcmod-zh.json（中间产物，再由 tools/merge-zh-db.js 合并进 data/mod-zh-db.json）
 * 注意：mcmod.cn 有访问频率限制，本脚本串行 + 延时，请勿高并发。 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'out');
const OUT = path.join(OUT_DIR, 'mcmod-zh.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 800;
const concurrency = 4;        /* mcmod 能承受的低并发 */
const delayMs = 220;

/* 待查询的英文模组名清单：从已有数据库 + 常见热门模组种子词拼出来 */
function seedQueries() {
  const dbPath = path.join(__dirname, '..', 'data', 'mod-zh-db.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const seeds = new Set();
  /* 已有条目的 key（多是 slug/modid） */
  for (const k of Object.keys(db.entries || {})) seeds.add(k);
  /* 关键词表里的英文词 */
  for (const list of Object.values(db.keywords || {})) for (const w of list) seeds.add(w);
  /* 通用热门模组补齐（覆盖各分类，供中文名库扩量） */
  const extra = [
    'applied energistics', 'ae2', 'mekanism', 'thermal expansion', 'immersive engineering',
    'industrial foregoing', 'forestry', 'buildcraft', 'railcraft', 'mystical agriculture',
    'farmers delight', 'pams harvestcraft', 'cooking for blockheads', 'twilight forest',
    'aether', 'ice and fire', 'alexs mobs', 'alexs caves', 'mowzies mobs', 'naturalist',
    'epic fight', 'better combat', 'first person model', 'not enough animations',
    'figura', '3d skin layers', 'dynamic lights', 'shulker box tooltip',
    'inventory profiles next', 'mouse tweaks', 'controlling', 'better advancements',
    'better ping display', 'inventory sorter', 'carry on', 'quark', 'supplementaries',
    'comforts', 'waystones', 'travelers backpack', 'sophisticated backpacks',
    'iron chest', 'storage drawers', 'refined storage', 'toms storage',
    'sophisticated storage', 'tinkers construct', 'silent gear', 'apotheosis',
    'curios', 'trinkets', 'artifacts', 'irons spellbooks', 'ars nouveau',
    'blood magic', 'astral sorcery', 'electroblobs wizardry', 'psi', 'occultism',
    'dungeons and taverns', 'tectonic', 'terralith', 'biomes o plenty',
    'oh the biomes youll go', 'better end', 'better nether', 'incendium', 'nullscape',
    'geophilic', 'sodium extra', 'iris', 'oculus', 'distant horizons', 'bobby',
    'chunky', 'spark', 'worldedit', 'litematica', 'minihud', 'tweakeroo',
    'item scroller', 'malilib', 'mod menu', 'cloth config', 'architectury',
    'yet another config lib', 'midnightlib', 'owo lib', 'balm', 'bookshelf',
    'puzzles lib', 'collective', 'kotlin for forge', 'crafttweaker', 'kubejs',
    'ftb quests', 'ftb library', 'ftb teams', 'ftb chunks', 'jade', 'wthit',
    'hwyla', 'the one probe', 'journeymap', 'xaeros minimap', 'xaeros world map',
    'voxelmap', 'betterf3', 'appleskin', 'entity model features', 'entity texture features',
    'cit resewn', 'zoomify', 'ok zoomer', 'immediatelyfast', 'bad optimizations',
    'entity culling', 'more culling', 'dynamic fps', 'fps display', 'lithium',
    'phosphor', 'starlight', 'ferritecore', 'memory leak fix', 'krypton', 'c2me',
    'noisium', 'modernfix', 'fast ip ping', 'jei', 'rei', 'emi', 'roughly enough items',
    'create', 'botania', 'optifine', 'embeddium', 'rubidium', 'magnesium', 'sodium',
    'fabric api', 'modmenu', 'sodium options api', 'reeses sodium options'
  ];
  for (const e of extra) seeds.add(e);
  return [...seeds].slice(0, LIMIT);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 从搜索结果 HTML 里提取 中文名 + 英文名 */
function parseResults(html) {
  const out = [];
  /* 条目：<a target="_blank" href="https://www.mcmod.cn/class/2785.html">钠 (Sodium...</a> */
  const re = /<a\s+target="_blank"\s+href="https:\/\/www\.mcmod\.cn\/class\/(\d+)\.html">([^<]{1,200})<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    let text = m[2].trim();
    /* 去掉 HTML 实体与多余空白 */
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
    if (!text || /^www\./.test(text)) continue;
    out.push({ mcmodId: id, raw: text });
  }
  return out;
}

/* 拆「中文名 (English Name)」→ { zh, en }；也处理「[缩写] 中文名 (English)」 */
function splitName(raw) {
  let s = raw;
  let abbr = '';
  const ab = s.match(/^\[([^\]]{1,12})\]\s*/);
  if (ab) { abbr = ab[1].trim(); s = s.slice(ab[0].length); }
  const pm = s.match(/\(([^)]{2,200})\)\s*$/);
  if (!pm) return null;
  const en = pm[1].trim();
  let zh = s.slice(0, pm.index).trim();
  if (!zh || !en) return null;
  if (!/[\u4e00-\u9fff]/.test(zh)) return null;   /* 中文名里必须有中文 */
  if (!/[A-Za-z]{2}/.test(en)) return null;        /* 英文名里必须有字母 */
  return { zh, en, abbr };
}

async function searchOne(key) {
  const url = 'https://search.mcmod.cn/s?key=' + encodeURIComponent(key);
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = Buffer.from(await res.arrayBuffer()).toString('utf8');
  const rows = parseResults(html);
  const got = [];
  for (const r of rows) {
    const n = splitName(r.raw);
    if (n) got.push(Object.assign({ mcmodId: r.mcmodId, query: key }, n));
  }
  return got;
}

async function runPool(items, n, fn, onProgress) {
  let i = 0, done = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { await fn(items[idx]); } catch (_) {}
      done++;
      if (onProgress && done % 25 === 0) onProgress(done, items.length);
      await sleep(delayMs);
    }
  });
  await Promise.all(workers);
}

(async () => {
  const queries = seedQueries();
  console.log('[fetch] 待查询英文名 ' + queries.length + ' 个（并发 ' + concurrency + '）');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const acc = {};   /* key(英文名小写) → { zh, en, abbr, mcmodId } */
  let hits = 0;

  await runPool(queries, concurrency, async (q) => {
    const got = await searchOne(q);
    if (!got.length) return;
    /* 取第一个能解析出的结果作为该关键词的对应项（mcmod 结果按相关度排序） */
    const best = got[0];
    const key = String(best.en).toLowerCase();
    if (!acc[key]) { acc[key] = best; hits++; }
    /* 其余结果也收进库（扩大覆盖），但只在没占用该英文名时 */
    for (const g of got.slice(1)) {
      const k2 = String(g.en).toLowerCase();
      if (!acc[k2]) { acc[k2] = g; hits++; }
    }
  }, (d, t) => console.log('  … ' + d + '/' + t));

  console.log('[fetch] 抓到 ' + Object.keys(acc).length + ' 条中文名映射');
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: Object.keys(acc).length, items: acc }, null, 1));
  console.log('[fetch] 已写出 ' + OUT);

  /* 抽样展示 */
  const sample = Object.entries(acc).slice(0, 15);
  console.log('\n抽样：');
  for (const [k, v] of sample) console.log('  ' + v.en + '  →  ' + (v.abbr ? '[' + v.abbr + '] ' : '') + v.zh);
})();
