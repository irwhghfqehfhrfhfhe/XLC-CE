/* 造一个最小但结构正确的 level.dat（gzip NBT），给 1.4.14 存档改名测试用 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = process.argv[2];
if (!dir) { console.error('用法: node qa/_mklevel.js <存档目录> [世界名]'); process.exit(1); }
const name = process.argv[3] || '测试世界';

const nm = (s) => { const b = Buffer.from(s, 'utf8'); const h = Buffer.alloc(2); h.writeUInt16BE(b.length, 0); return Buffer.concat([h, b]); };
const str = (v) => { const b = Buffer.from(v, 'utf8'); const h = Buffer.alloc(2); h.writeUInt16BE(b.length, 0); return Buffer.concat([h, b]); };
const int = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(v, 0); return b; };
const lng = (v) => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(v), 0); return b; };

/* Data 里的字段：字符串 + 整数 + 长整数 + 一个子复合（Version 里再有字符串），
   顺便把「递归找 LevelName」这条路走通 */
const verPayload = Buffer.concat([
  Buffer.from([8]), nm('Name'), str('1.21.4')
]);
const ver = Buffer.concat([Buffer.from([10]), nm('Version'), int(verPayload.length), verPayload, Buffer.from([0])]);

const dataPayload = Buffer.concat([
  Buffer.from([8]), nm('LevelName'), str(name),
  Buffer.from([3]), nm('GameType'), int(1),
  Buffer.from([4]), nm('LastPlayed'), lng(Date.now()),
  ver
]);
const dataC = Buffer.concat([Buffer.from([10]), nm('Data'), dataPayload, Buffer.from([0])]);
/* 真机 level.dat 的根复合**不带** i32 长度前缀（1.21.4 实测），这里照真机写 */
const rootPayload = Buffer.concat([dataC, Buffer.from([0])]);
const raw = Buffer.concat([Buffer.from([10]), nm(''), rootPayload]);

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'level.dat'), zlib.gzipSync(raw));
console.log('level.dat →', path.join(dir, 'level.dat'), raw.length, 'bytes (uncompressed)');
