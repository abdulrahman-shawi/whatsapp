// توليد أيقونات PWA (PNG) لمرة واحدة: خلفية بنفسجية مع مربع أبيض بزوايا دائرية
// التشغيل: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// مسافة إشارة موقعة (SDF) لمربع بزوايا دائرية — تغطية مضادة للتعرّج لكل بكسل
function roundedBoxCoverage(x, y, cx, cy, size, radius) {
  const qx = Math.abs(x - cx) - (size / 2 - radius);
  const qy = Math.abs(y - cy) - (size / 2 - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  const sd = Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - radius;
  return Math.min(1, Math.max(0, 0.5 - sd));
}

function makePng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // عمق ٨ بت
  ihdr[9] = 6; // RGBA

  const bg = [124, 58, 237]; // hsl(262 83% 58%) — نفس لون primary في Tailwind
  const rowLen = size * 4 + 1; // فلتر البايت 0 + بكسلات الصف
  const raw = Buffer.alloc(rowLen * size);
  const center = size / 2;
  const box = size * 0.62;
  const radius = box * 0.22;

  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < size; x++) {
      const cov = roundedBoxCoverage(x + 0.5, y + 0.5, center, center, box, radius);
      const o = y * rowLen + 1 + x * 4;
      raw[o] = Math.round(bg[0] + (255 - bg[0]) * cov);
      raw[o + 1] = Math.round(bg[1] + (255 - bg[1]) * cov);
      raw[o + 2] = Math.round(bg[2] + (255 - bg[2]) * cov);
      raw[o + 3] = 255;
    }
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync("public/icon-192.png", makePng(192));
writeFileSync("public/icon-512.png", makePng(512));
console.log("تم توليد public/icon-192.png و public/icon-512.png");
