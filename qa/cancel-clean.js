/* 验证「下载游戏中途取消 → XLC 数据里不留半截版本」这个修复（也是「下次下载卡 94%」的根因）。
 *
 * 跑法（隔离数据目录 + 隔离游戏目录，不碰用户的 .minecraft）：
 *   LMC_SMOKE_UI_JS=qa/cancel-clean.js \
 *   LMC_SMOKE_DATA_DIR=<临时数据目录> LMC_SMOKE_GAME_DIR=<临时游戏目录> \
 *   ./node_modules/.bin/electron .
 *
 * 断言（两轮，每轮都装到一半就取消）：
 *   1. install:done 回来时 cancelled=true，且 cleaned>=1（主进程确实删掉了半截目录）
 *   2. dir:scan 的 broken 为空（没有残留目录，也就不会有 __broken 归档）
 *   3. 版本列表里没有这个半截版本
 *   4. 第二次点安装能正常开始（不需要走「归档旧目录」那条路）
 */
const L = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const out = (s) => L.push(s);

const cfg = await window.lmc.getConfig();
if (!cfg || /[\\/]\.minecraft$/i.test(String(cfg.gameDir || ''))) {
  return { ok: false, lines: ['ABORT 游戏目录没有隔离（' + (cfg && cfg.gameDir) + '），拒绝在用户真实目录里跑这个测试'], summary: '未隔离，已中止' };
}
out('游戏目录: ' + cfg.gameDir);

const man = await window.lmc.getManifest();
const mf = (man && man.manifest) || {};
const target = (mf.latest && mf.latest.release) || (mf.versions && mf.versions[0] && mf.versions[0].id);
if (!target) return { ok: false, lines: L.concat(['ABORT 拿不到版本清单（网络不可用？）']), summary: '版本清单获取失败' };
out('测试版本: ' + target);

/* 单次「装到一半 → 取消 → 检查残留」 */
async function round(n) {
  const stages = [];
  let done = null;
  const offP = window.lmc.on('install:progress', (d) => stages.push(d.stage + ':' + d.percent));
  const offD = window.lmc.on('install:done', (d) => { done = d; });
  let started = false;
  try {
    const r = await window.lmc.install({ id: target, loader: 'Vanilla' });
    started = !!(r && r.started);
    if (!started) {
      out('FAIL 第' + n + '轮：安装没能开始 → ' + JSON.stringify(r));
      return false;
    }
    /* 等到客户端 jar 阶段（这时 versions/<id>/ 已经建好、正在往里写）再取消 */
    const t0 = Date.now();
    while (Date.now() - t0 < 60000 && !done) {
      if (stages.some(s => /^(client|libraries|assets)/.test(s))) break;
      await wait(150);
    }
    await wait(700);   /* 让 jar 写进去一点，确保目录里真有内容 */
    const c = await window.lmc.installCancel({ id: target, loader: 'Vanilla' });
    out('第' + n + '轮 取消请求: ' + JSON.stringify(c) + ' · 进度: ' + stages.slice(-3).join(' , '));
    const t1 = Date.now();
    while (Date.now() - t1 < 60000 && !done) await wait(120);
    if (!done) { out('FAIL 第' + n + '轮：取消后 60 秒没收到 install:done'); return false; }
    out('第' + n + '轮 install:done: cancelled=' + !!done.cancelled + ' cleaned=' + done.cleaned + ' err=' + (done.error || ''));
    if (!done.cancelled) { out('FAIL 第' + n + '轮：没有按取消结束'); return false; }
    if (!(done.cleaned >= 1)) { out('FAIL 第' + n + '轮：主进程没有清理半截版本目录（cleaned=' + done.cleaned + '）'); return false; }
    const sc = await window.lmc.scan();
    const broken = (sc && sc.broken) || [];
    const vers = ((sc && sc.versions) || []).map(v => v.name || v.id || v);
    out('第' + n + '轮 扫描: broken=' + broken.length + ' versions=[' + vers.join(',') + ']');
    if (broken.length) { out('FAIL 第' + n + '轮：XLC 数据里还留着残留目录 ' + broken.map(b => b.folder).join(',')); return false; }
    if (vers.includes(target)) { out('FAIL 第' + n + '轮：半截版本仍出现在版本列表里'); return false; }
    return true;
  } finally { offP(); offD(); }
}

const a = await round(1);
await wait(400);
const b = a ? await round(2) : false;

return {
  ok: a && b,
  lines: L,
  summary: (a && b) ? '取消后没有残留：两轮都删干净了' : '取消后仍会留内容 / 未能清理'
};
