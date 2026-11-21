// Erzeugt die App-Symbole (PNG) ohne Zusatzprogramme: node werkzeuge/icons-erstellen.js
// Motiv: schlichtes Fenster (blaue Titelleiste, graue Fläche) mit einem Umzugskarton.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, draw) {
  const px = Buffer.alloc(size * size * 3);
  const set = (x, y, [r, g, b]) => { if (x < 0 || y < 0 || x >= size || y >= size) return; const i = (y * size + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; };
  draw(size, set);
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const GRAU = [236, 233, 226], BLAU = [47, 93, 147], DUNKEL = [40, 40, 40], KARTON = [205, 190, 160], WEISS = [255, 255, 255];
function zeichne(size, set) {
  const s = v => Math.round(v * size / 100);
  const rect = (x0, y0, x1, y1, c) => { for (let y = s(y0); y < s(y1); y++) for (let x = s(x0); x < s(x1); x++) set(x, y, c); };
  const rahmen = (x0, y0, x1, y1, d, c) => { rect(x0, y0, x1, y0 + d, c); rect(x0, y1 - d, x1, y1, c); rect(x0, y0, x0 + d, y1, c); rect(x1 - d, y0, x1, y1, c); };
  rect(0, 0, 100, 100, GRAU);
  rect(0, 0, 100, 22, BLAU);                       // Titelleiste
  rect(78, 7, 90, 15, WEISS); rahmen(78, 7, 90, 15, 1.2, BLAU); // Schließen-Kästchen angedeutet
  // Karton
  rect(24, 40, 76, 84, KARTON);
  rahmen(24, 40, 76, 84, 2.6, DUNKEL);
  rect(24, 40, 76, 52, [190, 172, 138]);
  rahmen(24, 40, 76, 52, 2.6, DUNKEL);
  rect(47, 40, 53, 52, DUNKEL);                     // Klebeband
  rect(34, 62, 66, 66, DUNKEL);                     // Beschriftungsfeld
}

const ziel = path.join(__dirname, '..', 'icons');
fs.mkdirSync(ziel, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(path.join(ziel, name), png(size, zeichne));
  console.log('erstellt', name);
}
