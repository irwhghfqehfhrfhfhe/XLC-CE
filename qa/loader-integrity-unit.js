/* 加载器实例「缺文件 → 一打开就闪退」的根因验证（真实网络 + 真实 jar，不启界面）
 *
 * 背景：Fabric / Quilt 的启动主类在加载器本体（net.fabricmc:fabric-loader）里。
 * 旧代码拿元数据自己拼库清单（intermediary + loader.libraries + launcherMeta.libraries），
 * 恰好漏掉加载器本体 —— classpath 里没有 KnotClient，Java 一启动就
 * "Could not find or load main class ..."，表现就是装完模组、点启动、窗口一闪就退。
 *
 * 本脚本做四件事：
 *   A. 复现旧拼装 → 断言确实没有 fabric-loader（根因成立）
 *   B. 新拼装（官方 profile/json）→ 断言包含加载器本体
 *   C. 真下 8 个 jar，断言每个都完整、sha1 对得上、主类真的在 jar 里
 *   D. 截断 / 空文件 / 删除 → 断言完整性判定分别给出 corrupt / empty / missing
 *
 * 用法：node qa/loader-integrity-unit.js
 */
'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { libArtifactOf, zipLooksIntact, probeLibFile, libCoordKey, mergeLibLists } = require('../src/integrity-core');

const MC = process.argv[2] || '1.21.4';
const lines = [];
let fail = 0;
const ok = (cond, name, extra) => { lines.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' · ' + extra : '')); if (!cond) fail++; };
const log = (s) => lines.push('INFO ' + s);

async function fetchJson(url, ms) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms || 20000), headers: { 'User-Agent': 'xlc-ce-qa/1.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.json();
}
async function fetchText(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'xlc-ce-qa/1.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
async function download(url, dest) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'xlc-ce-qa/1.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  const buf = Buffer.from(await r.arrayBuffer());
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.writeFile(dest, buf);
  return buf.length;
}

(async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'xlc-loader-qa-'));
  const gd = path.join(tmp, 'game');
  await fsp.mkdir(gd, { recursive: true });

  /* ---- 取真实元数据 ---- */
  const list = await fetchJson('https://meta.fabricmc.net/v2/versions/loader/' + MC);
  const pick = list[0];
  const loaderVer = pick.loader.version;
  log('MC ' + MC + ' · Fabric loader ' + loaderVer + ' · 候选构建 ' + list.length);

  /* ---- A. 旧拼装（复现 bug）---- */
  const oldLibs = [];
  const addOld = (name, url) => { if (name) oldLibs.push({ name, url }); };
  if (pick.intermediary && pick.intermediary.maven) addOld(pick.intermediary.maven, 'https://maven.fabricmc.net/');
  for (const l of (pick.loader && Array.isArray(pick.loader.libraries) ? pick.loader.libraries : [])) addOld(l.name, l.url);
  const lml = pick.launcherMeta.libraries || {};
  const lmlArr = Array.isArray(lml) ? lml : [].concat(lml.client || [], lml.common || []);
  for (const l of lmlArr) addOld(l.name, l.url);
  const oldHasLoader = oldLibs.some(l => /fabric-loader/.test(l.name));
  log('旧拼装库清单: ' + oldLibs.map(l => l.name).join(' | '));
  ok(!oldHasLoader, 'A1 复现根因：旧拼装清单里确实没有加载器本体 fabric-loader');

  /* ---- B. 新拼装：官方 profile ---- */
  const profile = await fetchJson('https://meta.fabricmc.net/v2/versions/loader/' + MC + '/' + loaderVer + '/profile/json');
  const newLibs = (profile.libraries || []).map(l => ({ name: l.name, url: l.url }));
  const loaderEntry = newLibs.find(l => /^net\.fabricmc:fabric-loader:/.test(l.name));
  ok(!!loaderEntry, 'B1 官方 profile 含加载器本体', loaderEntry && loaderEntry.name);
  ok(/KnotClient$/.test(profile.mainClass || ''), 'B2 主类来自加载器本体', profile.mainClass);

  /* ---- C. 真下 8 个 jar 并校验 ---- */
  const cpPaths = [];
  let dl = 0;
  for (const l of newLibs) {
    const a = libArtifactOf(l);
    const dest = path.join(gd, 'libraries', a.path);
    const n = await download(a.url, dest);
    dl += n;
    cpPaths.push(dest);
    const intact = await zipLooksIntact(dest);
    const side = (await fetchText(a.url + '.sha1')).match(/[0-9a-f]{40}/i)[0].toLowerCase();
    const probe = await probeLibFile(dest, { path: a.path, url: a.url, sha1: side }, true);
    ok(intact && !probe, 'C ' + path.basename(dest) + ' 完整且 sha1 校验通过', n + ' B');
  }
  log('已下载 ' + newLibs.length + ' 个 jar，共 ' + Math.round(dl / 1024) + ' KB');

  /* 主类真的在 jar 里？直接把 fabric-loader.jar 当 zip 扫一遍中央目录 */
  const { findZipEntries } = require('../zipio');
  const loaderJar = path.join(gd, 'libraries', libArtifactOf(loaderEntry).path);
  const entries = findZipEntries(await fsp.readFile(loaderJar));
  const hasKnot = entries.some(e => /net\/fabricmc\/loader\/impl\/launch\/knot\/KnotClient\.class$/.test(e.name || e));
  ok(hasKnot, 'C2 加载器本体 jar 里真的有主类 KnotClient.class');

  /* 新清单的 classpath 一定包含加载器本体 */
  const cpHasLoader = cpPaths.some(p => /fabric-loader/.test(p));
  ok(cpHasLoader, 'C3 新实例的 classpath 包含加载器本体（旧清单会缺 → 必闪退）');

  /* ---- D. 三种损坏形态的判定 ---- */
  const one = cpPaths.find(p => /asm-9/.test(p)) || cpPaths[0];
  const orig = await fsp.readFile(one);

  const truncated = path.join(tmp, 'truncated.jar');
  await fsp.writeFile(truncated, orig.subarray(0, Math.floor(orig.length * 0.6)));
  const pt = await probeLibFile(truncated, null, true);
  ok(pt && pt.reason === 'corrupt', 'D1 被截断的 jar 判为 corrupt', pt && pt.reason);

  const empty = path.join(tmp, 'empty.jar');
  await fsp.writeFile(empty, Buffer.alloc(0));
  const pe = await probeLibFile(empty, null, true);
  ok(pe && pe.reason === 'empty', 'D2 0 字节文件判为 empty', pe && pe.reason);

  const pd = await probeLibFile(path.join(tmp, 'nope.jar'), null, true);
  ok(pd && pd.reason === 'missing', 'D3 不存在的文件判为 missing', pd && pd.reason);

  const good = await probeLibFile(one, null, true);
  ok(good === null, 'D4 完好的 jar 判为正常');

  const badSha = await probeLibFile(one, { path: 'x/asm.jar', sha1: 'f'.repeat(40) }, true);
  ok(badSha && badSha.reason === 'sha1', 'D5 内容对得上结构但 sha1 不符 → 判 sha1', badSha && badSha.reason);

  /* ---- E. 版本链合并：原版库 + 加载器库不能出现「同坐标两份」 ----
   * 真崩日志：duplicate ASM classes found on classpath:
   *   asm-9.6.jar（原版 1.21.4） + asm-9.10.1.jar（Fabric profile）
   * Fabric 的 Knot 在 <clinit> 里 verifyClasspath，发现重复类直接拒绝启动。 */
  const vman = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
  const vref = (vman.versions || []).find(x => x.id === MC);
  ok(!!vref, 'E0 取到官方版本清单', vref && vref.url);
  const vjson = vref ? await fetchJson(vref.url) : { libraries: [] };
  const vl = vjson.libraries || [];
  const fl = newLibs.map(l => ({ name: l.name, url: l.url }));
  /* 未去重的老行为：两份 asm 同时在 classpath 上 */
  const naive = [].concat(vl, fl).map(libCoordKey);
  const naiveDup = naive.filter((k, i) => k && naive.indexOf(k) !== i);
  ok(naiveDup.includes('org.ow2.asm:asm'), 'E1 复现根因：直接拼接会出现重复坐标 org.ow2.asm:asm', naiveDup.slice(0, 3).join(','));
  const merged = mergeLibLists(vl, fl);
  const keys = merged.map(libCoordKey).filter(Boolean);
  ok(new Set(keys).size === keys.length, 'E2 合并后没有重复坐标', keys.length + ' 条');
  const asmEntries = merged.filter(l => /^org\.ow2\.asm:asm:/.test(l.name || ''));
  ok(asmEntries.length === 1 && /9\.10\.1/.test(asmEntries[0].name || ''), 'E3 ASM 只留加载器那份（9.10.1）', asmEntries.map(l => l.name).join(','));
  /* 1.19+ 的 natives 是以 classifier 形式（group:artifact:version:natives-windows）单独列出的，
     去重键把 classifier 也算进去，所以它们必须原样保留 */
  const natives = merged.filter(l => /:natives/i.test(l.name || ''));
  ok(natives.length > 0, 'E4 原版的 natives（classifier）条目没被吞掉', natives.length + ' 条');
  ok(merged.length < vl.length + fl.length, 'E5 合并确实去掉了重复条目', vl.length + ' + ' + fl.length + ' → ' + merged.length);

  console.log(lines.join('\n'));
  console.log('[LOADER-INTEGRITY] ' + (fail ? 'FAIL ' + fail : 'PASS'));
  try {
    await fsp.mkdir(path.join(__dirname, 'out'), { recursive: true });
    await fsp.writeFile(path.join(__dirname, 'out', 'loader-integrity.log'), lines.join('\n') + '\n[LOADER-INTEGRITY] ' + (fail ? 'FAIL ' + fail : 'PASS') + '\n');
  } catch (_) {}
  await fsp.rm(tmp, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('[LOADER-INTEGRITY] ERROR ' + (e && e.stack || e)); process.exit(2); });
