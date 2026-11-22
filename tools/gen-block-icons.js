#!/usr/bin/env node
'use strict';
/* 【已弃用】生成自绘版方块图标 —— 现在的正式素材改由 extract-block-icons.js
 * 从本机 Minecraft 客户端 jar 提取原版贴图（用户要求与 PCL / HMCL 观感一致）。
 * 本脚本仅留档：如果想回到「不引用游戏美术资源」的自绘方案，重跑它即可覆盖回去。
 *
 * 生成版本列表用的「方块图标」：assets/blocks/{grass,command,cobblestone}.png
 *
 * 为什么要自己画：PCL / HMCL 的版本列表会给不同版本类型配一个方块图标
 *   （正式版 = 草方块、快照 = 命令方块、远古版 = 圆石，见 PCL2 的 McVersionState.DefaultLogo）。
 *   那两家用的图直接取自游戏贴图 / 各自仓库里的素材，本启动器不引用第三方美术资源
 *   （合规基线见 THIRD-PARTY.md），所以这里按方块的样子**自己画**一套 16×16 像素图。
 *
 * 输出：64×64（16×16 图案的 4 倍最近邻放大），界面按 20px 显示。
 *   放大再缩小的好处：小尺寸下不会因为 16→20 的非整数缩放出现锯齿错位。
 *
 * 用法：node tools/gen-block-icons.js
 * 说明：图案是写死的字符画 / 定值噪声，输出可复现（同一份源码永远生成同一张图）。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SCALE = 4;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'blocks');

/* ---------------- PNG 编码（RGB，无依赖） ---------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
/* pixels: 二维数组 [y][x] = [r,g,b] */
function encodePng(pixels) {
  const h = pixels.length, w = pixels[0].length;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    /* 位深 */
  ihdr[9] = 2;    /* 颜色类型 2 = RGB */
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3);
    raw[off] = 0;                                   /* 过滤器 0（None） */
    for (let x = 0; x < w; x++) {
      const p = pixels[y][x];
      raw[off + 1 + x * 3] = p[0]; raw[off + 2 + x * 3] = p[1]; raw[off + 3 + x * 3] = p[2];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------- 图案 ---------------- */
/* 草方块侧面：顶部一层草皮（下缘参差），下面全是泥土带颗粒 */
const GRASS_PAL = {
  '.': [134, 96, 67],   /* 泥土基色 */
  ',': [109, 76, 52],   /* 泥土暗 */
  "'": [158, 116, 84],  /* 泥土亮 */
  '-': [92, 63, 42],    /* 泥土最暗 */
  'g': [106, 170, 64],  /* 草基色 */
  'G': [74, 131, 45],   /* 草暗 */
  'h': [135, 196, 90]   /* 草亮 */
};
const GRASS = [
  'hGhghhGghhghGhgg',
  'gGhghhGghhghGhgg',
  'gghhgGGhghhgghhg',
  'hhgghhGhhgghhghh',
  'ghhGghhghhghhgGh',
  'gghgggGggggghggg',
  '.g.g.,g..g..,g.g',
  '..g..g..g..g..,.',
  '.....,.....g....',
  ",...'..,...'....",
  "..,...',......'.",
  ".,...'...,..,...",
  "...'.,....,.....",
  ".,....'..'...',.",
  "'....,......,...",
  "..,....'...'...."
];

/* 命令方块：橙棕色底 + 深色格线（九宫格）+ 每格中心提亮 */
function commandBlock() {
  const K = [90, 52, 24], k = [120, 70, 32], o = [176, 108, 58], O = [208, 140, 84];
  const g = [];
  for (let r = 0; r < 16; r++) {
    const row = [];
    for (let c = 0; c < 16; c++) {
      const edge = (r === 0 || r === 15 || c === 0 || c === 15);
      const grid = (r % 5 === 0 || c % 5 === 0);
      if (edge) { row.push(K); continue; }
      if (grid) { row.push(k); continue; }
      /* 每格（4×4）中心 2×2 提亮 */
      const lr = (r % 5) - 1, lc = (c % 5) - 1;
      row.push((lr === 1 || lr === 2) && (lc === 1 || lc === 2) ? O : o);
    }
    g.push(row.map(p => p));
  }
  return g;
}

/* 圆石：四颗圆石块铺在深灰缝里 —— 用「到最近石块中心的距离」做距离场：
   石心最亮 → 石身基色 → 石缘变暗 → 缝最暗，天然就是圆石那种「鹅卵石拼接」的感觉 */
function cobblestone() {
  const rnd = (i, j) => {                      /* 定值哈希：石块位置的抖动，可复现 */
    const s = Math.sin((i * 127.1 + j * 311.7) * 0.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const R = 3.55;                              /* 石块半径 */
  const centers = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    centers.push([4 + i * 8 + (rnd(i, j) - 0.5) * 2, 4 + j * 8 + (rnd(j, i) - 0.5) * 2]);
  }
  const light = [158, 158, 158], base = [126, 126, 126], edge = [100, 100, 100], mortar = [74, 74, 74];
  const g = [];
  for (let r = 0; r < 16; r++) {
    const row = [];
    for (let c = 0; c < 16; c++) {
      let d = 1e9;
      for (const [x, y] of centers) d = Math.min(d, Math.hypot(c - x, r - y));
      row.push(d < R - 1.5 ? light : d < R - 0.55 ? base : d < R ? edge : mortar);
    }
    g.push(row);
  }
  return g;
}

/* 字符画 → 颜色网格 */
function fromMap(map, pal) {
  return map.map((line, y) => {
    if (line.length !== 16) throw new Error('第 ' + (y + 1) + ' 行长度应为 16，实际 ' + line.length);
    return [...line].map(ch => {
      const p = pal[ch];
      if (!p) throw new Error('未知字符 "' + ch + '"（第 ' + (y + 1) + ' 行）');
      return p.slice();
    });
  });
}
/* 4 倍最近邻放大 */
function upscale(grid, n) {
  const out = [];
  for (const row of grid) {
    for (let k = 0; k < n; k++) {
      const rr = [];
      for (const px of row) for (let j = 0; j < n; j++) rr.push(px.slice());
      out.push(rr);
    }
  }
  return out;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const items = [
    ['grass', fromMap(GRASS, GRASS_PAL)],
    ['command', commandBlock()],
    ['cobblestone', cobblestone()]
  ];
  for (const [name, grid] of items) {
    const png = encodePng(upscale(grid, SCALE));
    const file = path.join(OUT_DIR, name + '.png');
    fs.writeFileSync(file, png);
    console.log(name.padEnd(12), '16×16 ×' + SCALE + ' →', String(png.length).padStart(5), 'bytes', file);
  }
  console.log('\n完成。这些图由本脚本生成，未使用任何第三方美术资源。');
}
main();
