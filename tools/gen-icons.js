'use strict';
/*
 * LMC 图标生成器（零依赖）
 * 生成 assets/icon.png (512x512) 与 assets/icon.ico (256x256, PNG 压缩)
 * 设计：现代圆角方块 + 对角祖母绿渐变 + 白色几何 L + 悬浮像素粒子
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- PNG 编码 ---------- */
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 绘图 ---------- */
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
// 圆角矩形 SDF（距离单位：归一化坐标）
function sdRect(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
}
// 抗锯齿 alpha（d 为像素距离）
function cov(d) { return clamp01(0.75 - d); }
function blend(r, g, b, a, cr, cg, cb, k) {
  return [r + (cr - r) * k, g + (cg - g) * k, b + (cb - b) * k, Math.max(a, k * 255)];
}

function drawIcon(S) {
  const px = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = (x + 0.5) / S, fy = (y + 0.5) / S;
      let r = 0, g = 0, b = 0, a = 0;
      // 圆角背板，对角渐变 #34d399 -> #0f766e
      const dBase = sdRect(fx, fy, 0.5, 0.5, 0.5, 0.5, 0.225) * S;
      const aBase = cov(dBase);
      if (aBase > 0) {
        const t = clamp01((fx + fy - 0.25) / 1.1);
        r = 0x34 + (0x0f - 0x34) * t;
        g = 0xd3 + (0x76 - 0xd3) * t;
        b = 0x99 + (0x6e - 0x99) * t;
        a = aBase * 255;
        // 白色几何 L（两段圆角矩形）
        const dV = sdRect(fx, fy, 0.345, 0.53, 0.082, 0.215, 0.045) * S;
        const dH = sdRect(fx, fy, 0.462, 0.655, 0.20, 0.082, 0.045) * S;
        const dL = Math.min(dV, dH);
        let k = cov(dL);
        if (k > 0) [r, g, b, a] = blend(r, g, b, a, 255, 255, 255, k);
        // 悬浮像素粒子 #a7f3d0
        const parts = [[0.68, 0.295, 0.082], [0.795, 0.165, 0.058], [0.615, 0.115, 0.042]];
        for (const [cx, cy, ph] of parts) {
          k = cov(sdRect(fx, fy, cx, cy, ph, ph, ph * 0.18) * S);
          if (k > 0) [r, g, b, a] = blend(r, g, b, a, 0xa7, 0xf3, 0xd0, k);
        }
      }
      const o = (y * S + x) * 4;
      px[o] = Math.round(r); px[o + 1] = Math.round(g); px[o + 2] = Math.round(b); px[o + 3] = Math.round(a);
    }
  }
  return px;
}

/* ---------- ICO 打包（内嵌 PNG） ---------- */
function buildIco(png256) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(1, 4); // 1 image
  const entry = Buffer.alloc(16);
  entry[0] = 0; entry[1] = 0;          // 256px
  entry[2] = 0; entry[3] = 0;          // 颜色数 / 保留
  entry.writeUInt16LE(1, 4);           // planes
  entry.writeUInt16LE(32, 6);          // bpp
  entry.writeUInt32LE(png256.length, 8);
  entry.writeUInt32LE(22, 12);         // offset
  return Buffer.concat([header, entry, png256]);
}

/* ---------- 输出 ---------- */
const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const S512 = 512, S256 = 256;
const icon512 = drawIcon(S512);
const png512 = encodePNG(S512, S512, icon512);
fs.writeFileSync(path.join(outDir, 'icon.png'), png512);

const k = S512 / S256;
const px256 = Buffer.alloc(S256 * S256 * 4);
for (let y = 0; y < S256; y++) {
  for (let x = 0; x < S256; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = Math.floor(y * k); yy < Math.floor((y + 1) * k); yy++) {
      for (let xx = Math.floor(x * k); xx < Math.floor((x + 1) * k); xx++) {
        const o = (yy * S512 + xx) * 4;
        r += icon512[o]; g += icon512[o + 1]; b += icon512[o + 2]; a += icon512[o + 3]; n++;
      }
    }
    const o = (y * S256 + x) * 4;
    px256[o] = Math.round(r / n); px256[o + 1] = Math.round(g / n);
    px256[o + 2] = Math.round(b / n); px256[o + 3] = Math.round(a / n);
  }
}
fs.writeFileSync(path.join(outDir, 'icon.ico'), buildIco(encodePNG(S256, S256, px256)));
console.log('[OK] assets/icon.png (512x512) + assets/icon.ico (256x256) 已生成');
