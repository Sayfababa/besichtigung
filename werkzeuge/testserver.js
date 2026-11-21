// Kleiner Webserver nur zum Testen am PC: node werkzeuge/testserver.js  →  http://localhost:8080
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const TYPEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const datei = path.join(ROOT, p);
  if (!datei.startsWith(ROOT) || datei.includes(`${path.sep}.git`)) { res.writeHead(403); return res.end(); }
  fs.readFile(datei, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Test-Server: http://localhost:${PORT}`));
