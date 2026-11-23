import { app, makePdf, fileOf, inspect, openWithPdfLib, createRunner, assert, assertEqual, PDFLib } from './harness.mjs';

const { engine } = app;
const { test, done } = createRunner();
console.log('\n[合并]');

const A = await makePdf([
  { text: 'A-PAGE-1' }, { text: 'A-PAGE-2', w: 400, h: 600 }, { text: 'A-PAGE-3' }
]);
const B = await makePdf([{ text: 'B-PAGE-1' }, { text: 'B-PAGE-2', rotate: 90 }]);

await test('按列表顺序合并，页数与文字顺序正确', async () => {
  const out = await engine.merge([{ file: fileOf(A, 'a.pdf') }, { file: fileOf(B, 'b.pdf') }], false);
  const info = await inspect(out);
  assertEqual(info.pageCount, 5, '合并后页数');
  assertEqual(info.pages.map((p) => p.text), ['A-PAGE-1', 'A-PAGE-2', 'A-PAGE-3', 'B-PAGE-1', 'B-PAGE-2'], '页面文字顺序');
});

await test('调整文件顺序后，输出顺序随之改变', async () => {
  const out = await engine.merge([{ file: fileOf(B, 'b.pdf') }, { file: fileOf(A, 'a.pdf') }], false);
  const info = await inspect(out);
  assertEqual(info.pages.map((p) => p.text), ['B-PAGE-1', 'B-PAGE-2', 'A-PAGE-1', 'A-PAGE-2', 'A-PAGE-3'], '倒序合并后的文字顺序');
});

await test('插入空白分隔页：每两个文件之间多一页空白', async () => {
  const out = await engine.merge([{ file: fileOf(A, 'a.pdf') }, { file: fileOf(B, 'b.pdf') }], true);
  const info = await inspect(out);
  assertEqual(info.pageCount, 6, '带分隔页的页数');
  assertEqual(info.pages[3].text, '', '分隔页没有文字');
  assertEqual(info.pages.map((p) => p.text), ['A-PAGE-1', 'A-PAGE-2', 'A-PAGE-3', '', 'B-PAGE-1', 'B-PAGE-2'], '分隔页位置');
});

await test('保留原始页面尺寸与旋转角度', async () => {
  const out = await engine.merge([{ file: fileOf(A, 'a.pdf') }, { file: fileOf(B, 'b.pdf') }], false);
  const info = await inspect(out);
  assertEqual([info.pages[1].width, info.pages[1].height], [400, 600], '第 2 页尺寸');
  assertEqual(info.pages[4].rotate, 90, '第 5 页旋转');
});

await test('输出可被 pdf-lib 重新打开，且是新的字节流', async () => {
  const out = await engine.merge([{ file: fileOf(A, 'a.pdf') }, { file: fileOf(B, 'b.pdf') }], false);
  const doc = await openWithPdfLib(out);
  assertEqual(doc.getPageCount(), 5, 'pdf-lib 读到的页数');
  assert(!Buffer.from(out).equals(Buffer.from(A)), '输出不应与输入相同');
});

await test('合并不会修改输入文件的字节', async () => {
  const before = Buffer.from(A).toString('base64');
  await engine.merge([{ file: fileOf(A, 'a.pdf') }, { file: fileOf(B, 'b.pdf') }], true);
  assertEqual(Buffer.from(A).toString('base64'), before, '输入文件字节');
});

await test('少于两个文件时拒绝处理', async () => {
  let err = null;
  try { await engine.merge([{ file: fileOf(A, 'a.pdf') }], false); } catch (e) { err = e; }
  assert(err, '应当抛出错误');
  assert(/至少需要两个/.test(err.message), '错误提示应说明需要两个文件');
});

await test('列表中含演示项目时拒绝生成假结果', async () => {
  let err = null;
  try { await engine.merge([{ file: fileOf(A, 'a.pdf') }, { name: 'demo.pdf', pages: 12, demo: true }], false); } catch (e) { err = e; }
  assert(err && /演示/.test(err.message), '应提示演示项目不能导出');
});

await test('加密 PDF 返回明确的加密错误', async () => {
  const raw = Buffer.from(A).toString('latin1');
  const tampered = raw.replace('/Root', '/Encrypt << /Filter /Standard /V 1 /R 2 /O <00000000000000000000000000000000> /U <00000000000000000000000000000000> /P -1 >> /Root');
  assert(tampered !== raw, '测试文件应已注入 Encrypt 标记');
  let err = null;
  try { await engine.pageCount(fileOf(Buffer.from(tampered, 'latin1'), 'locked.pdf')); } catch (e) { err = e; }
  assert(err, '应抛出错误');
  assert(err.code === 'encrypted', '错误码应为 encrypted，实际：' + (err && err.code));
});

await test('损坏文件返回 invalid 错误而不是假成功', async () => {
  let err = null;
  try { await engine.merge([{ file: fileOf(Buffer.from('this is not a pdf'), 'x.pdf') }, { file: fileOf(B, 'b.pdf') }], false); } catch (e) { err = e; }
  assert(err, '应抛出错误');
  assert(err.code === 'invalid', '错误码应为 invalid，实际：' + (err && err.code));
});

await test('空文件返回 empty 错误', async () => {
  let err = null;
  try { await engine.pageCount(fileOf(new Uint8Array(0), 'empty.pdf')); } catch (e) { err = e; }
  assert(err && err.code === 'empty', '错误码应为 empty');
});

await test('进度回调返回 false 时中止且不返回结果', async () => {
  let result = null, err = null;
  try {
    result = await engine.merge([{ file: fileOf(A, 'a.pdf') }, { file: fileOf(B, 'b.pdf') }], false, () => false);
  } catch (e) { err = e; }
  assert(!result, '取消后不应返回结果');
  assert(err && err.name === 'AbortError', '应以 AbortError 中止');
});

await test('BUG-07 合并后保留每个文件的裁剪框', async () => {
  const a = await PDFLib.PDFDocument.load(await makePdf([{ text: 'CA' }]));
  a.getPage(0).setCropBox(30, 30, 200, 300);
  const b = await PDFLib.PDFDocument.load(await makePdf([{ text: 'CB' }]));
  const out = await engine.merge([
    { file: fileOf(await a.save(), 'ca.pdf') },
    { file: fileOf(await b.save(), 'cb.pdf') }
  ], false);
  const doc = await PDFLib.PDFDocument.load(out);
  const box = doc.getPage(0).getCropBox();
  assertEqual(
    [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)],
    [30, 30, 200, 300],
    '第 1 页裁剪框'
  );
});

done('合并测试');
