/* 验证下载卡死不再无限等待。
   启动两个「恶意」本地服务器：
     /silent  —— 接受连接后永不响应（握手成功但不回话）
     /trickle —— 回 206 头并吐一点数据后彻底停住（下到一半卡死）
   两者都必须在超时后报错返回，而不是把整个安装永久挂起。
   通过隐藏窗口 + 项目自带 preload 调用 custom:download，走的是真实下载链路。 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const BODY = Buffer.alloc(8 * 1024 * 1024, 0x41); // 8MB

function startServer() {
  return new Promise((res) => {
    const server = http.createServer((req, resp) => {
      if (req.url === '/silent') return;                 /* 永不响应 */
      if (req.url.startsWith('/trickle')) {
        const range = req.headers.range;
        if (range && /bytes=0-0/.test(range)) {          /* 多线程 Range 探测：假装支持 */
          resp.writeHead(206, { 'Content-Range': 'bytes 0-0/' + BODY.length, 'Content-Length': '1' });
          resp.write(BODY.slice(0, 1)); resp.end(); return;
        }
        const m = String(range || '').match(/bytes=(\d+)-(\d*)/);
        if (m) {                                          /* 分段请求：吐一点就停，永不 end() */
          const s = parseInt(m[1], 10);
          resp.writeHead(206, { 'Content-Range': 'bytes ' + s + '-' + (s + 999) + '/' + BODY.length, 'Content-Length': '1000' });
          resp.write(BODY.slice(s, s + 1000));
          return;
        }
        resp.writeHead(200, { 'Content-Length': String(BODY.length) });   /* 单流：同样吐一点就停 */
        resp.write(BODY.slice(0, 1000));
        return;
      }
      resp.writeHead(404); resp.end();
    });
    server.listen(0, '127.0.0.1', () => res(server));
  });
}

(async () => {
  await app.whenReady();
  const server = await startServer();
  const port = server.address().port;
  const L = [];
  L.push('INFO 恶意服务器 127.0.0.1:' + port);

  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: false },
  });
  await win.loadURL('data:text/html,<title>stall-test</title>');

  const cases = [['A 永不响应', '/silent'], ['B 吐数据后卡死', '/trickle']];
  const results = [];
  for (const [name, route] of cases) {
    const file = name.slice(0, 1) + '-stall.bin';
    const url = 'http://127.0.0.1:' + port + route;
    const js = `window.lmc.customDownload(${JSON.stringify({ url, target: 'mods', instance: '_stalltest', fileName: file })})`;
    const t0 = Date.now();
    let r;
    try {
      r = await Promise.race([
        win.webContents.executeJavaScript(js, true),
        new Promise((res) => setTimeout(() => res({ ok: false, error: 'QA看门狗：90 秒仍未返回（依旧无限挂起）' }), 90000)),
      ]);
    } catch (e) { r = { ok: false, error: 'EXCEPTION ' + (e && e.message || e) }; }
    const ms = Date.now() - t0;
    const ok = r && r.ok === false;    /* 期望：明确报错退出，而不是一直挂着 */
    results.push(ok);
    L.push((ok ? 'PASS' : 'FAIL') + ' ' + name + ' → ' + (ms / 1000).toFixed(1) + 's 返回 ok=' + r.ok +
      ' · ' + String(r.error || '').slice(0, 110));
  }

  server.close();
  win.destroy();
  const allOk = results.every(Boolean);
  console.log('QA-STALL-BEGIN');
  L.forEach((x) => console.log(x));
  console.log('QA-STALL-END ' + (allOk ? 'PASS' : 'FAIL'));
  setTimeout(() => app.exit(allOk ? 0 : 1), 200);
})();
