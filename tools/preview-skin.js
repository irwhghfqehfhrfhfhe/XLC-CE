/* 生成「方块人」预览图（离线校准用）：把皮肤贴图的前脸按身体结构拼起来
 * 用法：node tools/preview-skin.js assets/skin-steve.png out.png [classic|slim] */
const fs = require('fs');
const zlib = require('zlib');

function decodePng(buf) {
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bd = data[8]; ct = data[9];
      if (data[12] !== 0) throw new Error('不支持交错 PNG');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8) throw new Error('只支持 8 位 PNG，当前 ' + bd);
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      line[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 4;
      out[d] = line[s];
      out[d + 1] = ch >= 3 ? line[s + 1] : line[s];
      out[d + 2] = ch >= 3 ? line[s + 2] : line[s];
      out[d + 3] = ch === 4 ? line[s + 3] : ch === 2 ? line[s + 1] : 255;
    }
    prev = line;
  }
  return { w, h, data: out };
}

function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunks = [];
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  chunks.push(chunk('IHDR', ihdr));
  chunks.push(chunk('IDAT', zlib.deflateSync(raw, { level: 9 })));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

let TBL = null;
function crc32(buf) {
  if (!TBL) {
    TBL = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TBL[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TBL[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return c ^ -1;
}

/* ---- 拼装几何（与 renderer.js 的 paintSkinPreview 保持一致） ---- */
function composeSkin(skin, slim) {
  const armW = slim ? 3 : 4;
  const bodyW = 8 + armW * 2;          /* 16 / 14 个皮肤像素宽 */
  const U = Math.floor(Math.min(160 / bodyW, 320 / 32));
  const W = 160, H = 320;
  const OX = Math.floor((W - bodyW * U) / 2);
  const px = Buffer.alloc(W * H * 4);
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H || a === 0) return;
    const d = (y * W + x) * 4, al = a / 255, ia = 1 - al;
    px[d] = Math.round(r * al + px[d] * ia);
    px[d + 1] = Math.round(g * al + px[d + 1] * ia);
    px[d + 2] = Math.round(b * al + px[d + 2] * ia);
    px[d + 3] = Math.max(px[d + 3], a);
  };
  const blit = (sx, sy, sw, sh, ux, uy) => {
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const s = ((sy + y) * skin.w + (sx + x)) * 4;
        const c = skin.data;
        for (let yy = 0; yy < U; yy++) {
          for (let xx = 0; xx < U; xx++) {
            put(OX + ux * U + x * U + xx, uy * U + y * U + yy, c[s], c[s + 1], c[s + 2], c[s + 3]);
          }
        }
      }
    }
  };
  const legacy = skin.w === 64 && skin.h === 32;
  const hx = armW;                     /* 头部 / 身体左边界（单位：皮肤像素） */
  blit(8, 8, 8, 8, hx, 0);                                   /* 头正面 */
  if (!legacy) blit(40, 8, 8, 8, hx, 0);                     /* 帽子层（半透明叠加） */
  blit(20, 20, 8, 12, hx, 8);                                /* 身体正面 */
  blit(44, 20, armW, 12, 0, 8);                              /* 玩家右手（画面左） */
  blit(legacy ? 44 : 36, legacy ? 20 : 52, armW, 12, hx + 8, 8); /* 玩家左手 */
  blit(4, 20, 4, 12, hx, 20);                                /* 玩家右腿 */
  blit(legacy ? 4 : 20, legacy ? 20 : 52, 4, 12, hx + 4, 20); /* 玩家左腿 */
  return { w: W, h: H, rgba: px };
}

if (require.main === module) {
  const [src, dst, model] = process.argv.slice(2);
  const skin = decodePng(fs.readFileSync(src));
  const out = composeSkin(skin, model === 'slim');
  fs.writeFileSync(dst, encodePng(out.w, out.h, out.rgba));
  console.log('wrote', dst, out.w + 'x' + out.h, 'skin', skin.w + 'x' + skin.h);
}

module.exports = { decodePng, encodePng, composeSkin };
