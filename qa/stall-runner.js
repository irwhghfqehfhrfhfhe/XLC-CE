/* 在同一个进程里起「恶意下载源」并拉起真正的启动器，
   目的是让 qa/pv-stall.js 能通过 IPC 打到这些会卡死的 URL。
   环境原因：跨进程的 localhost 连接在沙箱里被拦，同进程内正常。 */
const http = require('http');
const path = require('path');

const PORT = 45678;
const BODY = Buffer.alloc(8 * 1024 * 1024, 0x41); // 8MB

const server = http.createServer((req, resp) => {
  if (req.url === '/silent') return;                      /* 永不响应 */
  if (req.url.startsWith('/trickle')) {
    const range = req.headers.range;
    if (range && /bytes=0-0/.test(range)) {               /* 多线程 Range 探测：假装支持断点续传 */
      resp.writeHead(206, { 'Content-Range': 'bytes 0-0/' + BODY.length, 'Content-Length': '1' });
      resp.write(BODY.slice(0, 1)); resp.end(); return;
    }
    const m = String(range || '').match(/bytes=(\d+)-(\d*)/);
    if (m) {                                              /* 分段请求：吐一点就停，永不 end() */
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

server.listen(PORT, '127.0.0.1', () => {
  console.log('STALL-SERVER READY :' + PORT);
  require(path.join(__dirname, '..', 'main.js'));
});
