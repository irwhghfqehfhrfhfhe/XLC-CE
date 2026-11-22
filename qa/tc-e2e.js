/* 陶瓦联机端到端探针：本机建房 → 拿真房间码 → 用同一颗内核去 guest → 打印结果与日志
 * 用法：node qa/tc-e2e.js <terracotta.exe>
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const exe = process.argv[2];
const dir = path.join(os.tmpdir(), 'tc-e2e-' + process.pid);
fs.mkdirSync(dir, { recursive: true });
const portFile = path.join(dir, 'port.json');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(exe, ['--hmcl', portFile], { cwd: dir, stdio: 'ignore' });
  let port = 0;
  for (let i = 0; i < 40 && !port; i++) {
    await sleep(400);
    try { port = JSON.parse(fs.readFileSync(portFile, 'utf8')).port || 0; } catch (_) {}
  }
  if (!port) { console.log('内核没起来'); process.exit(1); }
  const base = 'http://127.0.0.1:' + port;
  const get = async (p) => {
    const r = await fetch(base + p, { signal: AbortSignal.timeout(10000) });
    return { status: r.status, body: await r.text() };
  };

  console.log('port=' + port);
  let r = await get('/state/scanning?player=Steve');
  console.log('scanning →', r.status);

  let code = '';
  for (let i = 0; i < 40 && !code; i++) {
    await sleep(1000);
    const st = await get('/state/');
    let j = {};
    try { j = JSON.parse(st.body); } catch (_) {}
    const s = JSON.stringify(j);
    const m = s.match(/U\/[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/);
    if (m) { code = m[0]; break; }
    if (i % 4 === 0) console.log('  [' + i + 's] ' + s.slice(0, 160));
  }
  console.log('房间码 =', code || '(没拿到)');

  if (code) {
    r = await get('/state/guesting?room=' + encodeURIComponent(code) + '&player=Alex');
    console.log('guesting(真房间码) →', r.status);
    await sleep(6000);
    const st = await get('/state/');
    console.log('guesting 之后状态 =', st.body.slice(0, 240));
  }

  /* 乱码房间码，看看是 400 还是 404 */
  r = await get('/state/guesting?room=ABCD-EFGH-JKLM-NPQR&player=Alex');
  console.log('guesting(无 U/ 前缀) →', r.status);
  r = await get('/state/guesting?room=U/ABCD-EFGH-JKLM-NPQR&player=Alex');
  console.log('guesting(U/ + 非法校验位) →', r.status);

  await get('/state/ide').catch(() => {});
  await sleep(800);

  /* 打印内核日志尾部 */
  const logRoot = path.join(os.tmpdir(), 'terracotta');
  try {
    const dirs = fs.readdirSync(logRoot).map(d => path.join(logRoot, d)).sort();
    const last = dirs[dirs.length - 1];
    const lf = path.join(last, 'application.log');
    if (fs.existsSync(lf)) {
      const lines = fs.readFileSync(lf, 'utf8').trim().split('\n');
      console.log('\n--- 内核日志（末 40 行） ---');
      console.log(lines.slice(-40).join('\n'));
    }
  } catch (e) { console.log('读日志失败: ' + e.message); }

  try { child.kill(); } catch (_) {}
  process.exit(0);
})();
