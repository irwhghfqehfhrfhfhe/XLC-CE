/* 验证「连接已建立但迟迟不给数据」的场景不再无限等待。
   httpbin.org/delay/300 会在 300 秒后才吐第一字节 —— 这正是以前会把进度条钉死的场景。
   期望：看门狗在 DL_STALL_MS 掐断并报错；对照组（把看门狗调到 300 秒，等同老行为）则会一直挂着。 */
const L = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function timeIt(url, budgetMs) {
  const t0 = Date.now();
  let r;
  try {
    r = await Promise.race([
      window.lmc.customDownload({ url, target: 'mods', instance: '_stalltest', fileName: 'delay.bin' }),
      new Promise((res) => setTimeout(() => res({ ok: false, error: '挂起超过 ' + (budgetMs / 1000) + ' 秒仍未返回' }), budgetMs)),
    ]);
  } catch (e) { r = { ok: false, error: 'EXCEPTION ' + (e && e.message || e) }; }
  return { ms: Date.now() - t0, r };
}

const A = await timeIt('https://httpbin.org/delay/300', 150000);
L.push('INFO 延迟源返回耗时 ' + (A.ms / 1000).toFixed(1) + 's · ' + String(A.r.error || A.r.ok || '').slice(0, 120));
const ok = A.ms < 120000 && A.r.ok === false;
L.push((ok ? 'PASS' : 'FAIL') + ' 卡死源在 ' + (A.ms / 1000).toFixed(1) + 's 内报错退出（未无限挂起）');

/* 顺带确认正常下载没被看门狗误伤：一个 1 秒延迟的正常小文件必须成功 */
await wait(300);
const B = await timeIt('https://httpbin.org/get', 60000);
const bok = B.r && B.r.ok === true;
L.push((bok ? 'PASS' : 'FAIL') + ' 正常下载未被误杀（' + (B.ms / 1000).toFixed(1) + 's）· ' + String(B.r.error || 'ok').slice(0, 90));

return { ok: ok && bok, lines: L, summary: (ok && bok) ? '看门狗生效且不影响正常下载' : '检查失败项' };
