'use strict';
/* 实例文件完整性 —— 与主进程解耦的纯工具（可被 node 单测直接 require）
 *
 * 闪退最常见的根因不是 Java、不是内存，而是「实例目录里少了东西」：加载器本体没下到、
 * 库文件被服务端截断、上次安装中断留下 0 字节的 jar。Java 一启动就 ClassNotFound /
 * ZipException 秒退，用户看到的就是「一打开游戏就闪退」。
 *
 * 这里只做「单个文件」层面的判定（坐标解析 + 结构校验 + 校验和比对），
 * 遍历版本链、发 IPC、下载补齐留在 main.js。 */
const fsp = require('fs/promises');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* 库条目 → 可下载产物。两种 JSON 形态都认：
 *   Mojang:      { name, downloads: { artifact: { url, path, sha1, size } } }
 *   Fabric/Quilt: { name: 'group:artifact:version', url: 'https://maven.../' } */
function libArtifactOf(l) {
  if (!l) return null;
  const a = l.downloads && l.downloads.artifact;
  if (a && a.path) return { path: a.path, url: a.url || null, sha1: a.sha1 || null, size: a.size || 0, name: l.name || a.path };
  if (!l.name) return null;
  const parts = String(l.name).split(':');
  if (parts.length < 3) return null;
  const g = parts[0], ar = parts[1], v = parts[2], cls = parts[3];
  const file = ar + '-' + v + (cls ? '-' + cls : '') + '.jar';
  const rel = g.replace(/\./g, '/') + '/' + ar + '/' + v + '/' + file;
  const base = (l.url || 'https://libraries.minecraft.net/').replace(/\/?$/, '/');
  return { path: rel, url: base + rel, sha1: l.sha1 || null, size: l.size || 0, name: l.name };
}

/* jar 结构是否完整：扫尾部 64KB 找 EOCD 签名（PK\x05\x06）。
 * 截断 / 半截下载 / 0 字节都过不了这一关，且只读末尾几十 KB，几乎不花时间。 */
async function zipLooksIntact(file) {
  try {
    const st = await fsp.stat(file);
    if (!st.isFile() || st.size < 22) return false;
    const len = Math.min(st.size, 66000);
    const buf = Buffer.alloc(len);
    const fh = await fsp.open(file, 'r');
    try { await fh.read(buf, 0, len, st.size - len); } finally { await fh.close(); }
    for (let i = len - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) return true;
    return false;
  } catch (_) { return false; }
}

function sha1File(p) {
  return new Promise((res, rej) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(p).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
}

/* 单个文件体检。返回 null = 没问题，否则 {file, rel, path, reason, detail, url, sha1, name}
 * reason：missing（没下到）/ empty（0 字节）/ corrupt（不是完整 zip，多半被截断）/ sha1（内容对不上） */
async function probeLibFile(file, a, deep, relOverride) {
  const rel = relOverride || (a && a.path) || path.basename(file);
  const base = {
    file: path.basename(file), rel, path: file,
    url: (a && a.url) || null, sha1: (a && a.sha1) || null, name: (a && a.name) || rel
  };
  let st;
  try { st = await fsp.stat(file); } catch (_) { return Object.assign(base, { reason: 'missing' }); }
  if (!st.isFile()) return Object.assign(base, { reason: 'missing' });
  if (st.size === 0) return Object.assign(base, { reason: 'empty' });
  if (deep && a && a.size && st.size !== a.size) return Object.assign(base, { reason: 'corrupt', detail: '大小不符 ' + st.size + '/' + a.size });
  /* 客户端 jar 是 zip 之外的特殊情况（某些整合包实例是目录形式），这里按文件判定 */
  if (!(await zipLooksIntact(file))) return Object.assign(base, { reason: 'corrupt' });
  if (deep && a && a.sha1) {
    let got = '';
    try { got = (await sha1File(file)).toLowerCase(); } catch (_) {}
    if (got && got !== String(a.sha1).toLowerCase()) return Object.assign(base, { reason: 'sha1', detail: 'SHA1 不符' });
  }
  return null;
}

/* 库合并：按「group:artifact[:classifier]」去重，子版本（加载器）覆盖父版本（原版）。
 *
 * 为什么必须去重：原版 1.21.4 自带 org.ow2.asm:asm:9.6，Fabric 的 profile 又带 asm:9.10.1。
 * 版本链过去是直接 [].concat 拼起来，两条都进 classpath —— Fabric 的 Knot 在 <clinit> 里有一步
 * verifyClasspath，发现「duplicate ASM classes found on classpath」就直接
 * ExceptionInInitializerError 崩掉。用户看到的就是「装了加载器 + 模组，一打开就闪退」，
 * 而且崩溃报告可能压根没生成（JVM 在写日志前就退了）。
 * Mojang 官方启动器、PCL、Prism 的做法都是同一个坐标只留一条、以子版本为准 —— 这里对齐。 */
function libCoordKey(l) {
  if (!l) return '';
  const n = String(l.name || '');
  if (n) {
    const p = n.split(':');
    if (p.length >= 3) return (p[0] + ':' + p[1] + (p[3] ? ':' + p[3] : '')).toLowerCase();
  }
  const a = l.downloads && l.downloads.artifact;
  if (a && a.path) {
    const m = String(a.path).match(/^(.+)\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (m) {
      /* natives 单独算一类，别和主 jar 互相覆盖 */
      const isNative = /-natives[-.]/i.test(m[4]) ? ':natives' : '';
      return (m[1].replace(/\//g, '.') + ':' + m[2] + isNative).toLowerCase();
    }
  }
  return '';
}
/* 合并两份库清单（parent 先、child 后）：同坐标以 child 为准，但保留 parent 的 natives / rules
   等附加信息，避免把原版需要的 dll 条目整个丢掉 */
function mergeLibLists(parentLibs, childLibs) {
  const out = [];
  const idx = new Map();
  const push = (l) => {
    if (!l) return;
    const k = libCoordKey(l);
    if (!k) { out.push(l); return; }
    if (!idx.has(k)) { idx.set(k, out.length); out.push(l); return; }
    const i = idx.get(k);
    const old = out[i] || {};
    const merged = Object.assign({}, old, l);
    if (!l.downloads && old.downloads) merged.downloads = old.downloads;
    else if (l.downloads && old.downloads && old.downloads.classifiers && !l.downloads.classifiers) {
      merged.downloads = Object.assign({}, l.downloads, { classifiers: old.downloads.classifiers });
    }
    if (!l.natives && old.natives) merged.natives = old.natives;
    if (!l.rules && old.rules) merged.rules = old.rules;
    out[i] = merged;
  };
  for (const l of parentLibs || []) push(l);
  for (const l of childLibs || []) push(l);
  return out;
}

module.exports = { libArtifactOf, zipLooksIntact, probeLibFile, sha1File, libCoordKey, mergeLibLists };
