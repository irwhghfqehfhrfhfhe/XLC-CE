/* 陶瓦联机内核接口探针：起内核 → 逐个打接口 → 打印状态码与响应体 → 关掉
 * 用法：node probe.js <terracotta.exe 路径> */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const exe = process.argv[2] || path.join(__dirname, 'terracotta.exe');
const dir = __dirname;
const portFile = path.join(dir, 'port.json');
try { fs.rmSync(portFile, { force: true }); } catch (_) {}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(exe, ['--hmcl', portFile], { cwd: dir, stdio: 'ignore' });
  let port = 0;
  for (let i = 0; i < 40 && !port; i++) {
    await sleep(400);
    try { port = JSON.parse(fs.readFileSync(portFile, 'utf8')).port || 0; } catch (_) {}
  }
  if (!port) { console.log('内核没起来（没写出 port.json）'); process.exit(1); }
  console.log('port=' + port);

  const probe = async (p, method = 'GET') => {
    try {
      const r = await fetch('http://127.0.0.1:' + port + p, { method, signal: AbortSignal.timeout(6000) });
      const txt = await r.text();
      console.log(String(r.status).padEnd(4), method.padEnd(4), p.padEnd(42), txt.replace(/\s+/g, ' ').slice(0, 220));
      return { status: r.status, txt };
    } catch (e) {
      console.log('ERR ', method.padEnd(4), p.padEnd(42), e.message);
      return { status: 0, txt: '' };
    }
  };

  await probe('/state/');
  await probe('/state/scaffolding');
  await probe('/state/guesting?room=AAAA-BBBB-CCCC-DDDD');
  await probe('/state/hosting?player=Steve');
  await probe('/state/hosting?player=Steve&public_nodes=xxx');
  await probe('/meta');
  await probe('/panic?peaceful=true', 'GET');

  await sleep(1500);
  try { child.kill(); } catch (_) {}
  process.exit(0);
})();
