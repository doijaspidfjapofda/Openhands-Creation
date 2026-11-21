/* 生成应用图标 desktop/icon.ico（多尺寸 PNG 容器），无第三方依赖。 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const px = new Uint8Array(size * size * 4);
  const set = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  const fillRect = (x0, y0, x1, y1, color) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, color);
  };
  const s = size / 256;
  fillRect(0, 0, size, size, [247, 243, 238, 255]);
  fillRect(Math.round(44 * s), Math.round(28 * s), Math.round(212 * s), Math.round(228 * s), [255, 255, 255, 255]);
  fillRect(Math.round(44 * s), Math.round(28 * s), Math.round(212 * s), Math.round(36 * s), [217, 72, 44, 255]);
  fillRect(Math.round(158 * s), Math.round(28 * s), Math.round(212 * s), Math.round(82 * s), [217, 72, 44, 255]);
  fillRect(Math.round(150 * s), Math.round(28 * s), Math.round(158 * s), Math.round(36 * s), [247, 243, 238, 255]);
  fillRect(Math.round(150 * s), Math.round(36 * s), Math.round(158 * s), Math.round(44 * s), [247, 243, 238, 255]);
  for (let i = 0; i < 3; i++) {
    const y = Math.round((112 + i * 32) * s);
    fillRect(Math.round(72 * s), y, Math.round(184 * s), y + Math.max(1, Math.round(10 * s)), [190, 182, 174, 255]);
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', (() => {
      const h = Buffer.alloc(13);
      h.writeUInt32BE(size, 0); h.writeUInt32BE(size, 4);
      h[8] = 8; h[9] = 6; h[10] = 0; h[11] = 0; h[12] = 0;
      return h;
    })()),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const sizes = [256, 64, 32, 16];
const images = sizes.map((s) => ({ size: s, data: png(s) }));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
const entries = [];
let offset = 6 + 16 * images.length;
for (const img of images) {
  const e = Buffer.alloc(16);
  e[0] = img.size === 256 ? 0 : img.size;
  e[1] = img.size === 256 ? 0 : img.size;
  e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(img.data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.data.length;
  entries.push(e);
}
const ico = Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
fs.writeFileSync(path.join(ROOT, 'desktop', 'icon.ico'), ico);
console.log('已生成 desktop/icon.ico (' + ico.length + ' 字节, ' + sizes.join('/') + ')');
