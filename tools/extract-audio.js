/* 从 MP4 里抽出音频轨，重建成只含音频的 m4a（不转码，AAC 原样搬运）
 *
 * 为什么不用 ffmpeg：这台机器上没有，也不想为一次任务引入二进制依赖。
 * 做法：解析 moov → 找 handler= Sound 的 trak，读它的 sample 表（stsz/stsc/stco），
 *       把所有音频 sample 按顺序拼成一个连续块，写成新的 mdat；
 *       新 stco 只留 1 个 chunk（指向新 mdat 开头），新 stsc 改成「1 个 chunk 装全部 sample」。
 *       stts / stsz / stsd 原样保留 —— sample 数量和每个 sample 的时长都没变，只是换了存放位置。
 * 结果：波形数据一个字节都没动，只是把视频轨和数据一起丢掉了。
 *
 * 用法：node tools/extract-audio.js <input.mp4> <output.m4a>
 */
'use strict';
const fs = require('fs');

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('用法: node tools/extract-audio.js <input.mp4> <output.m4a>');
  process.exit(2);
}

const src = fs.readFileSync(inPath);

/* ---------- 基础 box 读取 ---------- */
function boxAt(off) {
  if (off + 8 > src.length) return null;
  let size = src.readUInt32BE(off);
  const type = src.toString('latin1', off + 4, off + 8);
  let head = 8;
  if (size === 1) {                       /* 64 位大小 */
    size = Number(src.readBigUInt64BE(off + 8));
    head = 16;
  } else if (size === 0) {
    size = src.length - off;
  }
  if (size < head) return null;
  return { type, size, head, off, bodyOff: off + head, bodyEnd: off + size };
}
function children(box) {
  const out = [];
  let o = box.bodyOff;
  while (o + 8 <= box.bodyEnd) {
    const b = boxAt(o);
    if (!b) break;
    out.push(b);
    o = b.off + b.size;
  }
  return out;
}
function find(box, type) { return children(box).find(b => b.type === type); }
function findAll(box, type) { return children(box).filter(b => b.type === type); }

function topBoxes() {
  const out = [];
  let o = 0;
  while (o + 8 <= src.length) {
    const b = boxAt(o);
    if (!b) break;
    out.push(b);
    o = b.off + b.size;
  }
  return out;
}

/* ---------- 找音频 trak ---------- */
const tops = topBoxes();
const ftyp = tops.find(b => b.type === 'ftyp');
const moov = tops.find(b => b.type === 'moov');
if (!moov) { console.error('没有找到 moov（不支持分片 MP4）'); process.exit(1); }

const traks = findAll(moov, 'trak');
let sounTrak = null;
for (const t of traks) {
  const mdia = find(t, 'mdia');
  if (!mdia) continue;
  const hdlr = find(mdia, 'hdlr');
  if (!hdlr) continue;
  const handler = src.toString('latin1', hdlr.bodyOff + 8, hdlr.bodyOff + 12);
  if (handler === 'soun') { sounTrak = t; break; }
}
if (!sounTrak) { console.error('没有找到音频轨'); process.exit(1); }

const mdia = find(sounTrak, 'mdia');
const minf = find(mdia, 'minf');
const stbl = find(minf, 'stbl');
const stsd = find(stbl, 'stsd');
const stts = find(stbl, 'stts');
const stscBox = find(stbl, 'stsc');
const stszBox = find(stbl, 'stsz');
const stcoBox = find(stbl, 'stco') || find(stbl, 'co64');
const stssBox = find(stbl, 'stss');

if (!stscBox || !stszBox || !stcoBox) { console.error('缺少 sample 表（stsc/stsz/stco）'); process.exit(1); }

/* codec 名字：stsd 里第一个 entry 的格式（mp4a / enca …） */
const stsdCount = src.readUInt32BE(stsd.bodyOff + 4);
const codec = src.toString('latin1', stsd.bodyOff + 12, stsd.bodyOff + 16);
console.log('音频编码:', codec, '· stsd entries:', stsdCount);
if (codec !== 'mp4a') { console.error('音频编码不是 mp4a（可能是加密轨），已放弃'); process.exit(1); }

/* ---------- stsz → 每个 sample 的字节数 ---------- */
const szUniform = src.readUInt32BE(stszBox.bodyOff + 4);
const szCount = src.readUInt32BE(stszBox.bodyOff + 8);
const sizes = new Array(szCount);
if (szUniform === 0) {
  for (let i = 0; i < szCount; i++) sizes[i] = src.readUInt32BE(stszBox.bodyOff + 12 + i * 4);
} else {
  for (let i = 0; i < szCount; i++) sizes[i] = szUniform;
}

/* ---------- stsc → 每 chunk 几个 sample ---------- */
const stscCount = src.readUInt32BE(stscBox.bodyOff + 4);
const stsc = [];
for (let i = 0; i < stscCount; i++) {
  const o = stscBox.bodyOff + 8 + i * 12;
  stsc.push({
    firstChunk: src.readUInt32BE(o),
    samplesPerChunk: src.readUInt32BE(o + 4),
    descIndex: src.readUInt32BE(o + 8),
  });
}

/* ---------- stco/co64 → 每个 chunk 的文件偏移 ---------- */
const co64 = stcoBox.type === 'co64';
const chunkCount = src.readUInt32BE(stcoBox.bodyOff + 4);
const chunkOffs = new Array(chunkCount);
for (let i = 0; i < chunkCount; i++) {
  const o = stcoBox.bodyOff + 8 + (co64 ? i * 8 : i * 4);
  chunkOffs[i] = co64 ? Number(src.readBigUInt64BE(o)) : src.readUInt32BE(o);
}

/* ---------- 展开成 sample 列表 ---------- */
const samples = [];
let si = 0;
for (let ci = 0; ci < chunkCount; ci++) {
  let entry = stsc[0];
  for (const e of stsc) if (e.firstChunk <= ci + 1) entry = e;
  let off = chunkOffs[ci];
  for (let k = 0; k < entry.samplesPerChunk; k++) {
    if (si >= szCount) break;
    samples.push({ off, size: sizes[si] });
    off += sizes[si];
    si++;
  }
}
if (samples.length !== szCount) {
  console.log('⚠ sample 数不一致（表 ' + szCount + ' / 展开 ' + samples.length + '），按展开结果继续');
}
const total = samples.reduce((a, s) => a + s.size, 0);
console.log('音频轨: ' + samples.length + ' 个 sample, ' + (total / 1048576).toFixed(2) + ' MB');

/* ---------- 拼新 mdat ---------- */
const payload = Buffer.allocUnsafe(total);
let p = 0;
for (const s of samples) { src.copy(payload, p, s.off, s.off + s.size); p += s.size; }

/* ---------- 造 stco / stsc ---------- */
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; }
function box(type, ...parts) {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(body.length + 8), Buffer.from(type, 'latin1'), body]);
}

/* 新 stco：1 个 chunk，偏移先占位 0，等 moov 长度确定了再回填 */
const newStco = box('stco', u32(0), u32(1), u32(0));
/* 新 stsc：1 个 chunk 装全部 sample（first_chunk=1, samples_per_chunk=N, desc=1） */
const newStsc = box('stsc', u32(0), u32(1), u32(1), u32(samples.length), u32(1));

/* ---------- 重拼 stbl ---------- */
const stblParts = [];
for (const b of children(stbl)) {
  if (b.type === 'stco' || b.type === 'co64') { stblParts.push(newStco); continue; }
  if (b.type === 'stsc') { stblParts.push(newStsc); continue; }
  stblParts.push(src.subarray(b.off, b.off + b.size));
}
const newStbl = box('stbl', ...stblParts);

/* ---------- 重拼 minf / mdia / trak ---------- */
function rebuild(parent, replacer) {
  const parts = [];
  for (const b of children(parent)) {
    const r = replacer(b);
    parts.push(r || src.subarray(b.off, b.off + b.size));
  }
  return box(parent.type, ...parts);
}
const newMinf = rebuild(minf, b => (b.type === 'stbl' ? newStbl : null));
const newMdia = rebuild(mdia, b => (b.type === 'minf' ? newMinf : null));
const newTrak = rebuild(sounTrak, b => (b.type === 'mdia' ? newMdia : null));

/* ---------- 新 moov：mvhd + 只留这一个 trak ---------- */
const mvhd = find(moov, 'mvhd');
const mvhdBuf = src.subarray(mvhd.off, mvhd.off + mvhd.size);
const newMoov = box('moov', mvhdBuf, newTrak);

/* ---------- 组装文件 ---------- */
const ftypBuf = ftyp ? src.subarray(ftyp.off, ftyp.off + ftyp.size) : Buffer.alloc(0);
const mdatPayloadStart = ftypBuf.length + newMoov.length + 8;

/* 回填 stco 里的偏移（newStco 里第 8..12 字节是第一个 chunk offset） */
const patchAt = newMoov.indexOf(newStco, 0);
if (patchAt < 0) { console.error('内部错误：找不到新 stco'); process.exit(1); }
newMoov.writeUInt32BE(mdatPayloadStart, patchAt + 8 + 4 + 4);   /* size+type(8) + version+count(8) */

const newMdat = Buffer.concat([u32(payload.length + 8), Buffer.from('mdat', 'latin1'), payload]);
const out = Buffer.concat([ftypBuf, newMoov, newMdat]);
fs.writeFileSync(outPath, out);

console.log('已写出:', outPath);
console.log('  体积: ' + (out.length / 1048576).toFixed(2) + ' MB（原文件 ' + (src.length / 1048576).toFixed(2) + ' MB）');
