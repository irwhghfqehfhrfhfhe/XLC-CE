#!/usr/bin/env node
'use strict';
/* 版本列表「方块图标」的正式素材来源：直接从本机 Minecraft 客户端 jar 提取原版贴图。
 *
 * PCL / HMCL 的版本列表用的就是游戏里的方块贴图（正式版 = 草方块侧面、
 * 快照 = 命令方块正面、远古版 = 圆石，见 PCL2 McVersionState.DefaultLogo）。
 * 之前的 gen-block-icons.js 是自绘近似版，和原版观感对不上；本脚本改为与
 * PCL / HMCL 同源：解包 jar → 解码 PNG（索引色 / 4 位深都支持）→
 * 命令方块取动画第 0 帧 → 4 倍最近邻放大 → 覆盖 assets/blocks/*.png。
 *
 * ⚠ 版权：提取出来的是 Mojang 游戏素材，按 Mojang 使用指南仅限非商业粉丝工具
 *   使用（PCL / HMCL 同样如此）；不要把提取结果单独用于商业用途。
 *
 * 用法：node tools/extract-block-icons.js <jar路径> [...]
 *       不传参数时会尝试几个常见的本机 jar 位置。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'blocks');
const SCALE = 4;

/* ---------------- zip（jar）读取：只实现「按文件名取条目」 ---------------- */
function zipEntries(buf) {
  /* 从尾部找 EOCD（0x06054b50），拿到中央目录偏移 */
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 zip/jar（找不到 EOCD）');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const map = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
    map.set(name, { method, csize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return map;
}
function zipRead(buf, entry) {
  /* 本地文件头：跳过固定 30 字节 + 文件名 + extra 才是数据 */
  const p = entry.localOff;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error('本地文件头损坏');
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const data = buf.slice(p + 30 + nameLen + extraLen, p + 30 + nameLen + extraLen + entry.csize);
  return entry.method === 0 ? Buffer.from(data) : zlib.inflateRawSync(data);
}

/* ---------------- PNG 解码：只覆盖本项目需要的子集 ----------------
 * 8 位索引色（colortype 3，bitdepth 4/8）+ 全部 5 种行过滤器。
 * 返回 [y][x] = [r,g,b]。 */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504E47) throw new Error('不是 PNG');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0;
  let idat = [], palette = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.slice(off + 4, off + 8).toString('ascii');
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9];
      if (ctype !== 3) throw new Error('只支持索引色 PNG（colortype 3），实际 ' + ctype);
      if (depth !== 8 && depth !== 4) throw new Error('只支持 4/8 位深，实际 ' + depth);
    } else if (type === 'PLTE') {
      palette = [];
      for (let i = 0; i + 2 < data.length; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
    } else if (type === 'tRNS') {
      trns = Buffer.from(data);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!palette) throw new Error('缺少 PLTE');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 1;                                    /* 索引色每像素 ≤ 1 字节 */
  const stride = Math.ceil((w * depth) / 8);
  const out = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      switch (f) {
        case 1: line[x] = (line[x] + a) & 0xFF; break;
        case 2: line[x] = (line[x] + b) & 0xFF; break;
        case 3: line[x] = (line[x] + ((a + b) >> 1)) & 0xFF; break;
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xFF;
          break;
        }
      }
    }
    prev = line;
    /* 位展开 + 查调色板 */
    const row = [];
    for (let x = 0; x < w; x++) {
      const idx = depth === 8 ? line[x] : (x % 2 === 0 ? line[x >> 1] >> 4 : line[x >> 1] & 0x0F);
      const px = (palette[idx] || [255, 0, 255]).slice();
      if (trns && idx < trns.length) px.push(trns[idx]); else px.push(255);
      row.push(px);
    }
    out.push(row);
  }
  return { w, h, pixels: out };
}

/* ---------------- PNG 编码（复用 gen-block-icons.js 的实现思路，带 alpha） ---------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(b) {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(pixels) {
  const h = pixels.length, w = pixels[0].length;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;                       /* 8 位 RGBA */
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const o = y * (1 + w * 4);
    raw[o] = 0;
    for (let x = 0; x < w; x++) {
      const p = pixels[y][x];
      raw[o + 1 + x * 4] = p[0]; raw[o + 2 + x * 4] = p[1];
      raw[o + 3 + x * 4] = p[2]; raw[o + 4 + x * 4] = p[3] === undefined ? 255 : p[3];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
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

/* ---------------- 主流程 ---------------- */
const CANDIDATE_JARS = [
  'D:/PCL 正式版 2.13.0.1/.minecraft/versions/1.21.11-Fabric 0.19.5/1.21.11-Fabric 0.19.5.jar',
  'D:/PCL 正式版 2.13.0.1/.minecraft/versions/26.1/26.1.jar'
];
/* 素材清单：输出名 ← jar 内路径（命令方块是 4 帧竖排动画，取第 0 帧） */
const WANTED = [
  ['grass', 'assets/minecraft/textures/block/grass_block_side.png'],
  ['command', 'assets/minecraft/textures/block/command_block_front.png'],
  ['cobblestone', 'assets/minecraft/textures/block/cobblestone.png']
];

function main() {
  const jars = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const list = jars.length ? jars : CANDIDATE_JARS.filter(j => fs.existsSync(j));
  if (!list.length) { console.error('没找到可用的 jar，请传路径：node tools/extract-block-icons.js <jar> [...]'); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const done = new Set();
  for (const jar of list) {
    if (done.size >= WANTED.length) break;
    const buf = fs.readFileSync(jar);
    const entries = zipEntries(buf);
    for (const [name, entryPath] of WANTED) {
      if (done.has(name) || !entries.has(entryPath)) continue;
      let img;
      try { img = decodePng(zipRead(buf, entries.get(entryPath))); }
      catch (e) { console.error(jar, entryPath, '解码失败:', e.message); continue; }
      /* 命令方块 16×64 → 取最上面一帧（16×16） */
      const frame = img.h > 16 ? img.pixels.slice(0, 16) : img.pixels;
      const png = encodePng(upscale(frame, SCALE));
      const file = path.join(OUT_DIR, name + '.png');
      fs.writeFileSync(file, png);
      done.add(name);
      console.log(name.padEnd(12), '←', entryPath + '（' + img.w + '×' + img.h + '）→', String(png.length).padStart(5), 'bytes');
    }
  }
  const missing = WANTED.map(w => w[0]).filter(n => !done.has(n));
  if (missing.length) { console.error('缺少：' + missing.join(', ')); process.exit(1); }
  console.log('\n完成。素材提取自 Minecraft 客户端（Mojang 版权，非商业粉丝工具使用）。');
}
main();
