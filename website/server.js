/* XLC CE 官网本地预览服务器（不上线，仅本机） */
const http=require('http'),fs=require('fs'),path=require('path');
const MIME={'.html':'text/html; charset=utf8','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.exe':'application/octet-stream','.ico':'image/x-icon'};
const root=__dirname;
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/')p='/index.html';
  const f=path.normalize(path.join(root,p));
  if(!f.startsWith(root)){res.writeHead(403);return res.end();}
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);return res.end('Not Found');}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});
    res.end(d); });
}).listen(8765,'127.0.0.1',()=>console.log('SITE READY http://127.0.0.1:8765'));
