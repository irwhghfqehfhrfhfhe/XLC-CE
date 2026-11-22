/* 合并数据源，生成 XLC 最终使用的 data/mod-zh-db.json
 *
 * 合并优先级（同名 slug 时后者覆盖前者）：
 *   1. data/mod-zh-db-pcl.json  —— PCL2 内置 MC 百科数据库（1 万+ 条，权威）
 *   2. 手工条目（本脚本内联）    —— 补充网络流行译名、缩写变体、modid 变体
 *   3. data/mod-zh-keywords.json —— 中文搜索关键词表（保留，不被覆盖）
 *
 * 用法：node tools/merge-zh-db.js
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const PCL = path.join(DATA, 'mod-zh-db-pcl.json');
const CUR = path.join(DATA, 'mod-zh-db.json');

if (!fs.existsSync(PCL)) { console.error('缺少 ' + PCL + '，请先运行 tools/convert-pcl-wiki.js'); process.exit(1); }

const pcl = JSON.parse(fs.readFileSync(PCL, 'utf8'));
const cur = fs.existsSync(CUR) ? JSON.parse(fs.readFileSync(CUR, 'utf8')) : { entries: {}, keywords: {} };

/* 手工补充：PCL 库里没有、但社区/国内常用的别名与 modid 变体。
 * 这些值只在 PCL 库缺失时填补，不覆盖 PCL 权威译名。 */
const MANUAL = {
  'iris': 'Iris 光影加载器 (Iris)',
  'iris-shaders': 'Iris 光影加载器 (Iris)',
  'oculus': 'Oculus 光影加载器 (Oculus)',
  'optifine': '高清修复 (OptiFine)',
  'embeddium': 'Embeddium 渲染优化 (Embeddium)',
  'rubidium': 'Rubidium 渲染优化 (Rubidium)',
  'magnesium': 'Magnesium 渲染优化 (Magnesium)',
  'twilightforest': '暮色森林 (Twilight Forest)',
  'twilight-forest': '暮色森林 (Twilight Forest)',
  'aether': '天境 (The Aether)',
  'alexsmobs': 'Alex 的生物 (Alex\'s Mobs)',
  'alexs-mobs': 'Alex 的生物 (Alex\'s Mobs)',
  'alexscaves': 'Alex 的洞穴 (Alex\'s Caves)',
  'alexs-caves': 'Alex 的洞穴 (Alex\'s Caves)',
  'appliedenergistics2': '应用能源 2 (Applied Energistics 2)',
  'ae2': '应用能源 2 (Applied Energistics 2)',
  'cloth-config': 'Cloth Config 配置前置 (Cloth Config API)',
  'cloth-config2': 'Cloth Config 配置前置 (Cloth Config API)',
  'fabric-api': 'Fabric API 前置 (Fabric API)',
  'architectury': 'Architectury 架构前置 (Architectury API)',
  'architectury-api': 'Architectury 架构前置 (Architectury API)',
  'entity_model_features': 'EMF 实体模型特性 (Entity Model Features)',
  'entity_texture_features': 'ETF 实体纹理特性 (Entity Texture Features)',
  'entity_model_features_fabric': 'EMF 实体模型特性 (Entity Model Features)',
  'entity_texture_features_fabric': 'ETF 实体纹理特性 (Entity Texture Features)',
  'citresewn': 'CIT Resewn 自定义物品纹理 (CIT Resewn)',
  'distanthorizons': 'Distant Horizons 远景渲染 (Distant Horizons)',
  'bobby': 'Bobby 缓存视距 (Bobby)',
  'chunky': 'Chunky 区块预生成 (Chunky)',
  'spark': 'Spark 性能分析 (Spark)',
  'litematica': 'Litematica 投影 (Litematica)',
  'minihud': 'MiniHUD 迷你信息 (MiniHUD)',
  'tweakeroo': 'Tweakeroo 微调 (Tweakeroo)',
  'malilib': 'MaLiLib 前置库 (MaLiLib)',
  'worldedit': 'WorldEdit 创世神 (WorldEdit)',
  'kubejs': 'KubeJS 脚本模组 (KubeJS)',
  'crafttweaker': 'CraftTweaker 合成表修改 (CraftTweaker)',
  'ftbquests': 'FTB 任务 (FTB Quests)',
  'ftb-library': 'FTB 前置库 (FTB Library)',
  'ferritecore': 'FerriteCore 铁氧体磁芯 (FerriteCore)',
  'memoryleakfix': '内存泄漏修复 (Memory Leak Fix)',
  'moreculling': 'More Culling 更多剔除 (More Culling)',
  'entityculling': 'Entity Culling 实体剔除 (Entity Culling)',
  'immediatelyfast': 'ImmediatelyFast 即时渲染优化 (ImmediatelyFast)',
  'badoptimizations': 'BadOptimizations 不良优化 (BadOptimizations)',
  'dynamic-fps': 'Dynamic FPS 动态帧率 (Dynamic FPS)',
  'betterf3': 'BetterF3 更好的 F3 调试屏 (BetterF3)',
  'appleskin': 'AppleSkin 苹果皮 (AppleSkin)',
  'zoomify': 'Zoomify 缩放 (Zoomify)',
  'okzoomer': 'OkZoomer 缩放 (OkZoomer)',
  'shulkerboxtooltip': '潜影盒提示 (Shulker Box Tooltip)',
  'controlling': 'Controlling 按键管理 (Controlling)',
  'betteradvancements': '更好的进度界面 (Better Advancements)',
  'betterpingdisplay': '更好的延迟显示 (Better Ping Display)',
  'inventorysorter': '背包整理 (Inventory Sorter)',
  'mousetweaks': '鼠标手势 (Mouse Tweaks)',
  'carryon': 'Carry On 搬运 (Carry On)',
  'trashslot': '垃圾桶槽位 (TrashSlot)',
  'sodiumextra': 'Sodium Extra 钠扩展 (Sodium Extra)',
  'reeses-sodium-options': "Reese's 钠设置界面 (Reese's Sodium Options)",
  'sodium-extra': 'Sodium Extra 钠扩展 (Sodium Extra)',
  'modmenu': '模组菜单 (Mod Menu)',
  'sodiumoptionsapi': 'Sodium Options API 钠设置接口 (Sodium Options API)',
  'yacl': 'YACL 配置库 (Yet Another Config Lib)',
  'yet-another-config-lib': 'YACL 配置库 (Yet Another Config Lib)',
  'midnightlib': 'MidnightLib 配置库 (MidnightLib)',
  'owo-lib': 'oωo lib 配置库 (oωo lib)',
  'balm': 'Balm 前置库 (Balm)',
  'bookshelf': 'Bookshelf 书架前置 (Bookshelf)',
  'puzzleslib': 'Puzzles Lib 谜题前置 (Puzzles Lib)',
  'collective': 'Collective 集合前置 (Collective)',
  'kotlinforforge': 'Kotlin for Forge 前置 (Kotlin for Forge)',
  'clothconfig': 'Cloth Config 配置前置 (Cloth Config API)',
  'fsb': 'Fabric 前置 (Fabric API)',
  'sodiumdynamiclights': '钠/Embeddium：动态光源 (Sodium Dynamic Lights)',
  'dynamiclights': '动态光源 (Dynamic Lights)',
  'ironsspellbooks': '铁魔法 (Iron\'s Spells \'n Spellbooks)',
  'arsnouveau': '新生魔艺 (Ars Nouveau)',
  'ars-nouveau': '新生魔艺 (Ars Nouveau)',
  'bloodmagic': '血魔法 (Blood Magic)',
  'astralsorcery': '星辉魔法 (Astral Sorcery)',
  'occultism': '神秘主义 (Occultism)',
  'psi': 'Psi 灵能 (Psi)',
  'epicfight': '史诗战斗 (Epic Fight)',
  'epic-fight-mod': '史诗战斗 (Epic Fight)',
  'bettercombat': '更好的战斗 (Better Combat)',
  'firstpersonmodel': '第一人称模型 (First-person Model)',
  'notenoughanimations': '更多动画 (Not Enough Animations)',
  'playeranimator': '玩家动画前置 (Player Animator)',
  'figura': 'Figura 自定义玩家模型 (Figura)',
  '3dskinlayers': '3D 皮肤层 (3D Skin Layers)',
  'skinlayers3d': '3D 皮肤层 (3D Skin Layers)',
  'inventoryprofilesnext': '物品栏配置 (Inventory Profiles Next)',
  'inventory-profiles-next': '物品栏配置 (Inventory Profiles Next)',
  'travelersbackpack': '旅行者背包 (Traveler\'s Backpack)',
  'sophisticatedbackpacks': '精致背包 (Sophisticated Backpacks)',
  'sophisticatedstorage': '精致存储 (Sophisticated Storage)',
  'storagedrawers': '储物抽屉 (Storage Drawers)',
  'refinedstorage': '精致存储 (Refined Storage)',
  'ironchest': '更多箱子 (Iron Chests)',
  'ironchests': '更多箱子 (Iron Chests)',
  'toms_storage': "Tom 的简易存储 (Tom's Simple Storage)",
  'tinkersconstruct': '匠魂 (Tinkers\' Construct)',
  'tinkers-construct': '匠魂 (Tinkers\' Construct)',
  'silentgear': '静谧装备 (Silent Gear)',
  'apotheosis': '神化 (Apotheosis)',
  'curios': 'Curios 饰品栏前置 (Curios API)',
  'trinkets': 'Trinkets 饰品栏前置 (Trinkets)',
  'artifacts': '神器 (Artifacts)',
  'terralith': 'Terralith 地形改写 (Terralith)',
  'tectonic': 'Tectonic 构造地形 (Tectonic)',
  'biomesoplenty': '超多生物群系 (Biomes O\' Plenty)',
  'oh-the-biomes-youll-go': '你将会去的生物群系 (Oh The Biomes You\'ll Go)',
  'betterend': '更好的末地 (Better End)',
  'betternether': '更好的下界 (Better Nether)',
  'incendium': 'Incendium 下界重制 (Incendium)',
  'nullscape': 'Nullscape 末地重制 (Nullscape)',
  'dungeons-and-taverns': '地牢与酒馆 (Dungeons and Taverns)',
  'mysticalagriculture': '神秘农业 (Mystical Agriculture)',
  'cookingforblockheads': '懒人厨房 (Cooking for Blockheads)',
  'pams-harvestcraft': '潘马斯农场 (Pam\'s HarvestCraft)',
  'thermalexpansion': '热力膨胀 (Thermal Expansion)',
  'thermal_foundation': '热力基础 (Thermal Foundation)',
  'immersiveengineering': '沉浸工程 (Immersive Engineering)',
  'industrialforegoing': '工业先锋 (Industrial Foregoing)',
  'pneumaticcraft': '气动工艺 (PneumaticCraft)',
  'forestry': '林业 (Forestry)',
  'railcraft': '铁路 (RailCraft)',
  'mowziesmobs': 'Mowzie\'s 怪物 (Mowzie\'s Mobs)',
  'naturalist': '自然学家 (Naturalist)',
  'quark': '夸克 (Quark)',
  'supplementaries': '锦致装饰 (Supplementaries)',
  'comforts': '舒适 (Comforts)',
  'carryon2': 'Carry On 搬运 (Carry On)',
  'shulkerboxtooltip2': '潜影盒提示 (Shulker Box Tooltip)',
  'botania': '植物魔法 (Botania)',
  'createaddition': '机械动力：附加 (Create Addition)',
  'farmersdelight': '农夫乐事 (Farmer\'s Delight)',
  'jei': 'JEI 物品管理器 (Just Enough Items)',
  'rei': 'REI 物品管理器 (Roughly Enough Items)',
  'emi': 'EMI 物品管理器 (EMI)',
  'roughlyenoughitems': 'REI 物品管理器 (Roughly Enough Items)',
  'jade': 'Jade 方块信息 (Jade)',
  'wthit': 'WTHIT 方块信息 (WTHIT)',
  'hwyla': 'Hwyla 方块信息 (Hwyla)',
  'top': 'The One Probe 方块探针 (The One Probe)',
  'topplus': 'TOP Plus 方块信息扩展 (TOP Plus)',
  'jei2': 'JEI 物品管理器 (Just Enough Items)'
};

/* 合并：PCL 权威库 → 手工补充（仅填空缺） */
const entries = {};
for (const [k, v] of Object.entries(pcl.entries || {})) entries[k] = v;

let manualAdded = 0;
for (const [k, v] of Object.entries(MANUAL)) {
  if (!entries[k]) { entries[k] = v; manualAdded++; }
}
/* 保留既有库里 PCL 未覆盖的条目（多为本地 modid 变体） */
let curKept = 0;
for (const [k, v] of Object.entries(cur.entries || {})) {
  if (!entries[k]) { entries[k] = v.zh || (typeof v === 'string' ? v : ''); if (entries[k]) curKept++; }
}
/* 清掉空值 */
for (const k of Object.keys(entries)) if (!entries[k]) delete entries[k];

const out = {
  _note: '模组中文名数据库。主体来自 PCL2 内置 MC 百科数据库（权威译名），另含手工补充的国内常用别名与 modid 变体。字段：key=Modrinth/CurseForge slug 或 modid（小写），value=中文名（形如「中文名 (English Name)」）。',
  _source: 'https://github.com/Meloong-Git/PCL（《PCL 分发有限许可》+《PCL 存储库合理使用指南》，按轻度使用条款署名）+ XLC 补充',
  _generatedAt: new Date().toISOString(),
  _count: Object.keys(entries).length,
  entries,
  keywords: cur.keywords || {}
};

fs.writeFileSync(CUR, JSON.stringify(out, null, 1));
console.log('[merge] 合并完成');
console.log('  PCL 库条目:        ' + Object.keys(pcl.entries || {}).length);
console.log('  手工新增:          ' + manualAdded);
console.log('  旧库保留:          ' + curKept);
console.log('  最终条目总数:      ' + Object.keys(entries).length);
console.log('  中文关键词组:      ' + Object.keys(out.keywords).length);
console.log('  输出: ' + CUR + '  (' + Math.round(fs.statSync(CUR).size / 1024) + ' KB)');
