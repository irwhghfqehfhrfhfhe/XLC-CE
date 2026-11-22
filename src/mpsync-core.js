'use strict';
/* 联机模组同步的纯逻辑（不碰文件系统、不联网，方便单测）
 *
 * 背景：同一个世界，房主客户端装的模组和加入方不一致时，轻则方块/物品显示错乱，
 * 重则被服务端直接踢掉（协议错误 / mod rejected），而游戏本身不会告诉你缺了什么。
 * 这里负责两件纯计算的事：
 *   1) 把模组清单压成一段可以塞进 MQTT 信令的字符串（JSON → deflate → base64）；
 *   2) 拿房主清单和本地已装的模组比对，分出「缺的 / 版本不同 / 完全一致」三类。
 *
 * 判定口径：sha1 完全相同 = 同一份文件（不提示）；不同文件但 modid 相同 = 已安装、
 * 版本不同（不算缺，不强制装）；连 modid 都没有 = 真缺（要提示安装）。
 */

const zlib = require('zlib');

const MP_WIRE_PREFIX = 'z1:';       /* 编码版本前缀：将来换格式时靠它兼容旧包 */
const MP_WIRE_MAX_RAW = 4 * 1024 * 1024; /* 解压上限，防止收到畸形数据把内存吃光 */

function encodeManifest(obj) {
  const raw = Buffer.from(JSON.stringify(obj || {}), 'utf8');
  const packed = zlib.deflateRawSync(raw, { level: 9 });
  return MP_WIRE_PREFIX + packed.toString('base64');
}

function decodeManifest(str) {
  if (!str || typeof str !== 'string') return null;
  try {
    const s = str.trim();
    let obj;
    if (s.startsWith(MP_WIRE_PREFIX)) {
      const buf = zlib.inflateRawSync(Buffer.from(s.slice(MP_WIRE_PREFIX.length), 'base64'), { maxOutputLength: MP_WIRE_MAX_RAW });
      obj = JSON.parse(buf.toString('utf8'));
    } else {
      /* 明文 JSON 也认（调试 / 手工构造用） */
      obj = JSON.parse(s);
    }
    if (!obj || !Array.isArray(obj.mods)) return null;
    return obj;
  } catch (_) { return null; }
}

/* 本地索引：{ bySha1: {sha1: 文件名} | Map, byId: {modid: {name, sha1, version}} | Map } */
function indexGet(map, key) {
  if (!map) return null;
  if (typeof map.get === 'function') return map.get(key) || null;
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

/* hostMods: [{ f 文件名, h sha1, s 大小, i modid, v 版本, p CF 指纹 }]
 * 返回三类：missing（要装）/ outdated（装了但版本不同）/ same（一模一样） */
function diffMods(hostMods, localIndex) {
  const bySha1 = (localIndex && localIndex.bySha1) || null;
  const byId = (localIndex && localIndex.byId) || null;
  const missing = [], outdated = [], same = [];
  const seen = new Set();
  for (const m of (Array.isArray(hostMods) ? hostMods : [])) {
    if (!m || !m.h) continue;
    const sha1 = String(m.h).toLowerCase();
    if (seen.has(sha1)) continue;
    seen.add(sha1);
    if (indexGet(bySha1, sha1)) { same.push(m); continue; }
    const hit = m.i ? indexGet(byId, String(m.i).toLowerCase()) : null;
    if (hit) outdated.push({ host: m, local: hit });
    else missing.push(m);
  }
  return { missing, outdated, same };
}

/* 房间码规整：去掉「U/」前缀、空格与连字符，只留大写字母数字（频道名用）。
   房间码形如 U/XXXX-XXXX-XXXX-XXXX，前缀是固定格式，先摘掉再清剩余分隔符，
   否则频道名里会多一个恒定的 U（不影响正确性，但没必要） */
function normRoom(room) {
  return String(room || '').toUpperCase().replace(/^\s*U\s*\/\s*/, '').replace(/[^0-9A-Z]/g, '');
}

module.exports = { MP_WIRE_PREFIX, encodeManifest, decodeManifest, diffMods, normRoom };
