import { app, makePdf, makePng, TINY_JPEG, fileOf, inspect, openPdfjs, createRunner, assert, assertEqual, PDFLib } from './harness.mjs';

const { convert: ZJConvert } = app;
const { test, done } = createRunner();
console.log('\n[转换]');

const SRC = await makePdf([{ text: 'CONV-ONE' }, { text: 'CONV-TWO' }, { text: 'CONV-THREE' }]);

await test('识别 PNG / JPEG 文件头', async () => {
  assertEqual(ZJConvert.detectImageType(makePng(4, 4)), 'png', 'PNG');
  assertEqual(ZJConvert.detectImageType(new Uint8Array(TINY_JPEG)), 'jpeg', 'JPEG');
  assertEqual(ZJConvert.detectImageType(new Uint8Array(Buffer.from('GIF89a'))), '', 'GIF 不支持');
});

await test('页面范围：全部 / 当前页', async () => {
  assertEqual(ZJConvert.scopeIndexes('all', 1, 3), [0, 1, 2], '全部');
  assertEqual(ZJConvert.scopeIndexes('current', 1, 3), [1], '当前页');
  assertEqual(ZJConvert.scopeIndexes('current', 9, 3), [2], '越界时取最后一页');
  assertEqual(ZJConvert.scopeIndexes('all', 0, 0), [], '空文档');
});

await test('图片转 PDF：按顺序每页一张，自动方向', async () => {
  const wide = makePng(300, 200);
  const tall = makePng(200, 400);
  const bytes = await ZJConvert.imagesToPdf([
    { file: fileOf(wide, 'wide.png'), name: 'wide.png' },
    { file: fileOf(tall, 'tall.png'), name: 'tall.png' }
  ], { orientation: 'auto' });
  const info = await inspect(bytes);
  assertEqual(info.pageCount, 2, '页数');
  assertEqual([Math.round(info.pages[0].width), Math.round(info.pages[0].height)], [842, 595], '横向图片使用横向页');
  assertEqual([Math.round(info.pages[1].width), Math.round(info.pages[1].height)], [595, 842], '纵向图片使用纵向页');
});

await test('图片转 PDF：强制纵向 / 横向', async () => {
  const wide = makePng(300, 200);
  const portrait = await inspect(await ZJConvert.imagesToPdf([{ file: fileOf(wide, 'w.png'), name: 'w.png' }], { orientation: 'portrait' }));
  assertEqual([Math.round(portrait.pages[0].width), Math.round(portrait.pages[0].height)], [595, 842], '强制纵向');
  const landscape = await inspect(await ZJConvert.imagesToPdf([{ file: fileOf(wide, 'w.png'), name: 'w.png' }], { orientation: 'landscape' }));
  assertEqual([Math.round(landscape.pages[0].width), Math.round(landscape.pages[0].height)], [842, 595], '强制横向');
});

await test('图片转 PDF：支持 JPEG', async () => {
  const bytes = await ZJConvert.imagesToPdf([{ file: fileOf(new Uint8Array(TINY_JPEG), 'tiny.jpg'), name: 'tiny.jpg' }], { orientation: 'auto' });
  const info = await inspect(bytes);
  assertEqual(info.pageCount, 1, 'JPEG 生成一页');
});

await test('图片转 PDF：不支持的格式给出明确错误', async () => {
  let err = null;
  try {
    await ZJConvert.imagesToPdf([{ file: fileOf(new Uint8Array(Buffer.from('GIF89a....')), 'a.gif'), name: 'a.gif' }], {});
  } catch (e) { err = e; }
  assert(err && err.code === 'format', '应返回 format 错误');
  assert(/只支持 PNG 和 JPG/.test(err.message), '错误提示应说明支持格式');
});

await test('图片转 PDF：没有图片时拒绝处理', async () => {
  let err = null;
  try { await ZJConvert.imagesToPdf([], {}); } catch (e) { err = e; }
  assert(err && /至少一张图片/.test(err.message), '应提示需要图片');
});

await test('图片转 PDF：取消时中止且不返回结果', async () => {
  let result = null, err = null;
  try {
    result = await ZJConvert.imagesToPdf([{ file: fileOf(makePng(4, 4), 'a.png'), name: 'a.png' }], {}, () => false);
  } catch (e) { err = e; }
  assert(!result, '取消后不应返回结果');
  assert(err && err.name === 'AbortError', '应以 AbortError 中止');
});

await test('PDF 转文本：提取每页文字并保留页序', async () => {
  const doc = await openPdfjs(SRC);
  const text = await ZJConvert.pdfToText(doc, {});
  await doc.destroy();
  assert(/CONV-ONE/.test(text), '包含第 1 页文字');
  assert(/CONV-TWO/.test(text), '包含第 2 页文字');
  assert(/--- 第 1 页 ---/.test(text) && /--- 第 3 页 ---/.test(text), '包含页标记');
  assert(text.indexOf('CONV-ONE') < text.indexOf('CONV-THREE'), '保持页序');
});

await test('PDF 转文本：按指定页序导出', async () => {
  const doc = await openPdfjs(SRC);
  const text = await ZJConvert.pdfToText(doc, { items: [{ page: 3 }, { page: 1 }] });
  await doc.destroy();
  assert(text.indexOf('CONV-THREE') < text.indexOf('CONV-ONE'), '按传入顺序输出');
});

await test('PDF 转文本：空白页有明确标记', async () => {
  const doc = await openPdfjs(SRC);
  const text = await ZJConvert.pdfToText(doc, { items: [{ blank: { w: 595, h: 842 } }] });
  await doc.destroy();
  assert(/空白页/.test(text), '空白页应有标记');
});

await test('PDF 转文本：没有文档时给出明确错误', async () => {
  let err = null;
  try { await ZJConvert.pdfToText(null, {}); } catch (e) { err = e; }
  assert(err && err.code === 'nodoc', '应返回 nodoc 错误');
});

async function pageItems(spec, draw) {
  const { PDFDocument, StandardFonts } = PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  draw(page, font);
  const pdf = await openPdfjs(await doc.save());
  const tc = await (await pdf.getPage(1)).getTextContent();
  return tc.items;
}

await test('BUG-08 两栏排版按列输出，不左右交错', async () => {
  const items = await pageItems(null, (page, font) => {
    let y = 760;
    for (let i = 1; i <= 4; i++) {
      page.drawText('LEFT-' + i, { x: 50, y, size: 12, font });
      page.drawText('RIGHT-' + i, { x: 330, y, size: 12, font });
      y -= 22;
    }
  });
  const text = ZJConvert.formatTextContent(items);
  const columns = text.split(/\n{2,}/);
  assertEqual(columns.length, 2, '应分成两栏：' + JSON.stringify(text));
  assertEqual(columns[0].split('\n').map((l) => l.trim()), ['LEFT-1', 'LEFT-2', 'LEFT-3', 'LEFT-4'], '左栏顺序');
  assertEqual(columns[1].split('\n').map((l) => l.trim()), ['RIGHT-1', 'RIGHT-2', 'RIGHT-3', 'RIGHT-4'], '右栏顺序');
});

await test('BUG-08 单栏排版按行输出，不误判为多栏', async () => {
  const items = await pageItems(null, (page, font) => {
    page.drawText('ONLY-1', { x: 50, y: 700, size: 12, font });
    page.drawText('ONLY-2', { x: 50, y: 680, size: 12, font });
    page.drawText('ONLY-3', { x: 50, y: 660, size: 12, font });
  });
  assertEqual(ZJConvert.formatTextContent(items), 'ONLY-1\nONLY-2\nONLY-3', '单栏顺序');
});

await test('文本整理会合并多余空行', async () => {
  const text = ZJConvert.formatTextContent([
    { str: 'Hello ', hasEOL: false },
    { str: 'world', hasEOL: true },
    { str: '', hasEOL: true },
    { str: '', hasEOL: true },
    { str: 'next', hasEOL: false }
  ]);
  assertEqual(text, 'Hello world\n\nnext', '整理后的文本');
});

done('转换测试');
