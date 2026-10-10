const http = require('http');
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
http.createServer((req,res)=>{
  const url = new URL(req.url, 'http://127.0.0.1');
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.resolve(root, '.' + p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data)=>{
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(data);
  });
}).listen(8765, '127.0.0.1', ()=>console.log('SCS server on http://127.0.0.1:8765'));