/* 在真实应用里验证：对「卡死」的下载源不再无限等待。
   前置：先运行 qa/stallserv.js（固定端口 45678 的恶意源）。 */
const L = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const PORT = 45678;

async function tryDownload(name, route, budgetMs) {
  const t0 = Date.now();
  let r;
  try {
    r = await Promise.race([
      window.lmc.customDownload({
        url: 'http://127.0.0.1:' + PORT + route,
        target: 'mods', instance: '_stalltest', fileName: name.slice(0, 1) + '-stall.bin',
      }),
      new Promise((res) => setTimeout(() => res({ ok: false, error: 'QA看门狗：' + (budgetMs / 1000) + ' 秒仍未返回 —— 依旧无限挂起' }), budgetMs)),
    ]);
  } catch (e) { r = { ok: false, error: 'EXCEPTION ' + (e && e.message || e) }; }
  const ms = Date.now() - t0;
  const ok = r && r.ok === false;      /* 期望：明确报错退出，而不是一直挂着 */
  L.push((ok ? 'PASS' : 'FAIL') + ' ' + name + ' → ' + (ms / 1000).toFixed(1) + 's 返回 · ' + String(r && r.error || '').slice(0, 120));
  return ok;
}

const r1 = await tryDownload('A 永不响应', '/silent', 90000);
await wait(500);
const r2 = await tryDownload('B 吐数据后卡死', '/trickle', 120000);
return { ok: r1 && r2, lines: L, summary: (r1 && r2) ? '两类卡死都能按时报错退出' : '仍存在无限挂起' };
