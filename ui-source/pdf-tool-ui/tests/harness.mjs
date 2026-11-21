/* 测试工具：在 Node 中加载项目自带的 pdf-lib、本机引擎和纯逻辑模块，并检查生成的 PDF。 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PDFLib = require(path.join(APP_ROOT, 'vendor/pdf-lib.min.js'));
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

/* 用同一运行环境执行浏览器脚本，避免跨 realm 的 Uint8Array 判断失败 */
function loadScript(file, win) {
  const code = fs.readFileSync(path.join(APP_ROOT, file), 'utf8');
  const fn = new Function('window', 'document', 'FileReader', code + '\n//# sourceURL=' + file);
  fn(win, undefined, undefined);
}

export function createApp() {
  const win = { PDFLib };
  loadScript('assets/pdf-pages.js', win);
  loadScript('assets/pdf-engine.js', win);
  loadScript('assets/pdf-convert.js', win);
  return { window: win, engine: win.ZJEngine, pages: win.ZJPages, convert: win.ZJConvert };
}

export const app = createApp();

/* 生成无隐私测试 PDF：每页一个唯一文本，可选尺寸与初始旋转 */
export async function makePdf(spec) {
  const { PDFDocument, rgb, degrees, StandardFonts } = PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const p of spec) {
    const page = doc.addPage([p.w || 595.28, p.h || 841.89]);
    if (p.rotate) page.setRotation(degrees(p.rotate));
    if (p.text) page.drawText(p.text, { x: 48, y: (p.h || 841.89) - 80, size: 24, font, color: rgb(0, 0, 0) });
  }
  return doc.save({ useObjectStreams: false });
}

/* 生成指定尺寸的 PNG（无第三方依赖），用于图片转 PDF 测试 */
export function makePng(width, height, rgb) {
  const [r, g, b] = rgb || [200, 120, 90];
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]));
}

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
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/* 1x1 JPEG，用于验证 JPEG 识别 */
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);

export function fileOf(bytes, name) {
  const copy = new Uint8Array(bytes);
  return {
    name,
    size: copy.length,
    type: 'application/pdf',
    arrayBuffer: async () => copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)
  };
}

/* 用 pdf.js 重新打开输出文件，读取页数、页面尺寸、旋转角度与每页文字 */
export async function inspect(bytes) {
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: path.join(APP_ROOT, 'node_modules/pdfjs-dist/standard_fonts') + path.sep,
    verbosity: 0
  });
  const pdf = await task.promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push({
      width: Math.round(vp.width * 100) / 100,
      height: Math.round(vp.height * 100) / 100,
      rotate: page.rotate,
      text: content.items.map((i) => i.str).join('').trim()
    });
  }
  await pdf.destroy();
  return { pageCount: pdf.numPages, pages };
}

/* 返回 pdf.js 文档对象（调用方负责 destroy） */
export async function openPdfjs(bytes) {
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: path.join(APP_ROOT, 'node_modules/pdfjs-dist/standard_fonts') + path.sep,
    verbosity: 0
  });
  return task.promise;
}

export async function openWithPdfLib(bytes) {
  return PDFLib.PDFDocument.load(bytes, { throwOnInvalidObject: true });
}

/* 极简测试运行器 */
export function createRunner() {
  const results = [];
  async function test(name, fn) {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log('  ✓ ' + name);
    } catch (err) {
      results.push({ name, ok: false, error: err });
      console.log('  ✗ ' + name + '\n    ' + (err && err.message ? err.message : err));
    }
  }
  function done(suiteName) {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${suiteName}: ${results.length - failed.length}/${results.length} 通过`);
    if (failed.length) process.exitCode = 1;
    return failed.length === 0;
  }
  return { test, done, results };
}

export function assert(cond, message) {
  if (!cond) throw new Error(message || '断言失败');
}

export function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error((message ? message + '：' : '') + '期望 ' + b + '，实际 ' + a);
}
