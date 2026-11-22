/* 回归：完整装一次原版，确认「取消清理」这套改动没有影响成功路径。
 * 跑法：
 *   LMC_SMOKE_UI_JS=qa/install-ok.js LMC_SMOKE_DATA_DIR=<临时数据目录> LMC_SMOKE_GAME_DIR=<临时游戏目录> \
 *   ./node_modules/.bin/electron .
 * 断言：install:done.ok=true；版本列表里能看到该版本；broken 为空（没有残留）。
 */
const L = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const out = (s) => L.push(s);

const cfg = await window.lmc.getConfig();
if (!cfg || /[\\/]\.minecraft$/i.test(String(cfg.gameDir || ''))) {
  return { ok: false, lines: ['ABORT 游戏目录没有隔离（' + (cfg && cfg.gameDir) + '）'], summary: '未隔离，已中止' };
}
const man = await window.lmc.getManifest();
const mf = (man && man.manifest) || {};
const target = (mf.latest && mf.latest.release) || (mf.versions && mf.versions[0] && mf.versions[0].id);
out('游戏目录: ' + cfg.gameDir);
out('安装版本: ' + target);

let done = null;
const stages = [];
let lastP = '';
const offP = window.lmc.on('install:progress', (d) => {
  if (stages[stages.length - 1] !== d.stage) stages.push(d.stage);
  const line = d.stage + ' ' + d.percent + '% ' + (d.text || '');
  if (line !== lastP) { lastP = line; console.log('[PROG] ' + line); }
});
const offD = window.lmc.on('install:done', (d) => { done = d; });

const t0 = Date.now();
const r = await window.lmc.install({ id: target, loader: 'Vanilla' });
out('install 调用: ' + JSON.stringify(r));
const budget = 15 * 60 * 1000;
while (!done && Date.now() - t0 < budget) await wait(500);
offP(); offD();

if (!done) {
  try { await window.lmc.installCancel({ id: target, loader: 'Vanilla' }); } catch (_) {}
  return { ok: false, lines: L.concat(['FAIL 15 分钟内没装完（阶段: ' + stages.join('→') + '）']), summary: '超时' };
}
const secs = Math.round((Date.now() - t0) / 1000);
out('install:done: ok=' + !!done.ok + ' versionId=' + (done.versionId || '') + ' err=' + (done.error || '') + ' cleaned=' + done.cleaned + ' · 用时 ' + secs + 's');
out('阶段: ' + stages.join('→'));

const sc = await window.lmc.scan();
const vers = ((sc && sc.versions) || []).map(v => v.name || v.id || v);
const broken = (sc && sc.broken) || [];
out('扫描: versions=[' + vers.join(',') + '] broken=' + broken.length);

const pass = !!done.ok && vers.includes(target) && broken.length === 0;
return { ok: pass, lines: L, summary: pass ? '完整安装成功，且没有残留' : '完整安装回归失败' };
