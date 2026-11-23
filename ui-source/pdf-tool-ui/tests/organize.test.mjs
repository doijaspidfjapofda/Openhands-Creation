import { app, makePdf, fileOf, inspect, createRunner, assert, assertEqual, PDFLib } from './harness.mjs';

const { engine, pages: ZJPages } = app;
const { test, done } = createRunner();
console.log('\n[页面整理]');

const SRC = await makePdf([
  { text: 'PAGE-1' }, { text: 'PAGE-2', w: 400, h: 600 }, { text: 'PAGE-3' }, { text: 'PAGE-4' }
]);
const file = fileOf(SRC, 'four.pdf');

function model(pages) {
  return pages.map((p) => ({ id: p.id, index: p.index, rot: p.rot, blank: p.blank, w: p.w, h: p.h }));
}

function initial() {
  return [
    { id: 'p0', index: 0, rot: 0, blank: false, w: 595.28, h: 841.89 },
    { id: 'p1', index: 1, rot: 0, blank: false, w: 400, h: 600 },
    { id: 'p2', index: 2, rot: 0, blank: false, w: 595.28, h: 841.89 },
    { id: 'p3', index: 3, rot: 0, blank: false, w: 595.28, h: 841.89 }
  ];
}

async function exportPages(pages) {
  return inspect(await engine.createFromPages(file, model(pages)));
}

await test('旋转 90° 会写入导出文件，并改变显示方向', async () => {
  const pages = ZJPages.rotate(initial(), [0], 90);
  const info = await exportPages(pages);
  assertEqual(info.pages[0].rotate, 90, '第 1 页旋转角');
  assertEqual([info.pages[0].width, info.pages[0].height], [841.89, 595.28], '旋转后的显示尺寸');
});

await test('连续两次左旋等于 180°', async () => {
  let pages = initial();
  pages = ZJPages.rotate(pages, [1], 270);
  pages = ZJPages.rotate(pages, [1], 270);
  assertEqual(pages[1].rot, 180, '模型角度');
  const info = await exportPages(pages);
  assertEqual(info.pages[1].rotate, 180, '导出文件角度');
  assertEqual([info.pages[1].width, info.pages[1].height], [400, 600], '180° 不交换宽高');
});

await test('旋转四页后回到 0°，不会残留多余角度', async () => {
  let pages = initial();
  for (let i = 0; i < 4; i++) pages = ZJPages.rotate(pages, [2], 90);
  assertEqual(pages[2].rot, 0, '模型角度');
  assertEqual((await exportPages(pages)).pages[2].rotate, 0, '导出角度');
});

await test('复制页面：副本紧跟被复制页，内容一致', async () => {
  const dup = ZJPages.duplicate(initial(), [1]);
  assertEqual(dup.pages.length, 5, '模型页数');
  assertEqual(dup.at, 2, '副本插入位置');
  const info = await exportPages(dup.pages);
  assertEqual(info.pageCount, 5, '导出页数');
  assertEqual(info.pages.map((p) => p.text), ['PAGE-1', 'PAGE-2', 'PAGE-2', 'PAGE-3', 'PAGE-4'], '复制后的内容顺序');
});

await test('删除页面：导出页数与内容同步减少', async () => {
  const pages = ZJPages.remove(initial(), [2]);
  assertEqual(pages.length, 3, '模型页数');
  const info = await exportPages(pages);
  assertEqual(info.pages.map((p) => p.text), ['PAGE-1', 'PAGE-2', 'PAGE-4'], '删除后的内容');
});

await test('插入空白页：位置正确、尺寸跟随相邻页、没有内容', async () => {
  const at = 2;
  const dims = ZJPages.blankDims(initial(), at);
  const inserted = ZJPages.insertBlank(initial(), at, dims);
  assertEqual(inserted.at, 2, '插入位置');
  const info = await exportPages(inserted.pages);
  assertEqual(info.pageCount, 5, '导出页数');
  assertEqual(info.pages[2].text, '', '空白页没有文字');
  assertEqual([info.pages[2].width, info.pages[2].height], [400, 600], '空白页尺寸跟随第 2 页');
  assertEqual(info.pages.map((p) => p.text), ['PAGE-1', 'PAGE-2', '', 'PAGE-3', 'PAGE-4'], '插入后的顺序');
});

await test('在旋转页后插入空白页时，空白页使用显示尺寸', async () => {
  let pages = ZJPages.rotate(initial(), [0], 90);
  pages = ZJPages.insertBlank(pages, 1, ZJPages.blankDims(pages, 1)).pages;
  const info = await exportPages(pages);
  assertEqual([info.pages[1].width, info.pages[1].height], [841.89, 595.28], '空白页与旋转页视觉一致');
});

await test('拖动排序：第 4 页移到最前', async () => {
  const pages = ZJPages.move(initial(), 3, 0);
  const info = await exportPages(pages);
  assertEqual(info.pages.map((p) => p.text), ['PAGE-4', 'PAGE-1', 'PAGE-2', 'PAGE-3'], '移动后的顺序');
});

await test('拖动排序：向前拖动时落点正确（不偏移）', async () => {
  const pages = ZJPages.move(initial(), 0, 3);
  assertEqual(pages.map((p) => p.index), [1, 2, 0, 3], '第 1 页应落在第 3 位');
});

await test('撤销/重做真实影响导出结果', async () => {
  const hist = ZJPages.createHistory(40);
  let pages = initial();
  hist.push(pages);
  pages = ZJPages.rotate(pages, [0], 90);
  hist.push(pages);
  pages = ZJPages.remove(pages, [3]);
  hist.push(pages);

  assert(hist.canUndo(), '应可撤销');
  const undone = hist.undo();
  assertEqual(undone.length, 4, '撤销后恢复 4 页');
  assertEqual(undone[0].rot, 90, '撤销只回退最后一步，旋转仍在');
  const info = await exportPages(undone);
  assertEqual(info.pageCount, 4, '撤销后的导出页数');
  assertEqual(info.pages[0].rotate, 90, '撤销后的导出旋转');

  const redone = hist.redo();
  assertEqual(redone.length, 3, '重做后再次删除');
  assertEqual((await exportPages(redone)).pageCount, 3, '重做后的导出页数');

  const back = hist.undo();
  const back2 = hist.undo();
  assertEqual(back2.length, 4, '继续撤销回到初始页数');
  assertEqual(back2[0].rot, 0, '继续撤销回到初始旋转');
  assertEqual(back.length, 4, '中间状态页数');
});

await test('撤销历史保存的是快照，后续修改不会污染历史', async () => {
  const hist = ZJPages.createHistory(40);
  const pages = initial();
  hist.push(pages);
  pages[0].rot = 90;
  pages.push({ id: 'x', index: 0, rot: 0, blank: false, w: 595, h: 842 });
  const snap = hist.current();
  assertEqual(snap.length, 4, '历史快照页数');
  assertEqual(snap[0].rot, 0, '历史快照旋转');
});

await test('组合操作后导出：排序 + 旋转 + 复制 + 删除 + 空白页', async () => {
  let pages = initial();
  pages = ZJPages.move(pages, 3, 0);
  pages = ZJPages.rotate(pages, [0], 90);
  pages = ZJPages.duplicate(pages, [0]).pages;
  pages = ZJPages.remove(pages, [2]);
  pages = ZJPages.insertBlank(pages, pages.length, ZJPages.blankDims(pages, pages.length)).pages;
  const info = await exportPages(pages);
  assertEqual(info.pageCount, 5, '最终页数');
  assertEqual(info.pages.map((p) => p.text), ['PAGE-4', 'PAGE-4', 'PAGE-2', 'PAGE-3', ''], '最终内容顺序');
  assertEqual(info.pages[0].rotate, 90, '旋转保留在第 1 页');
});

await test('整理导出不会修改原文件', async () => {
  const before = Buffer.from(SRC).toString('base64');
  await engine.createFromPages(file, model(ZJPages.rotate(initial(), [0, 1, 2, 3], 90)));
  assertEqual(Buffer.from(SRC).toString('base64'), before, '原文件字节');
});

await test('没有页面时拒绝导出', async () => {
  let err = null;
  try { await engine.createFromPages(file, []); } catch (e) { err = e; }
  assert(err && /至少要包含一页/.test(err.message), '应提示至少一页');
});

await test('页码模型越界时报错而不是生成错误页面', async () => {
  let err = null;
  try { await engine.createFromPages(file, [{ id: 'x', index: 99, rot: 0, blank: false }]); } catch (e) { err = e; }
  assert(err && err.code === 'pagerange', '应返回 pagerange 错误');
});

await test('BUG-07 裁剪框（CropBox）在整理导出后保留', async () => {
  const src = await PDFLib.PDFDocument.load(await makePdf([{ text: 'CROP-1' }]));
  src.getPage(0).setCropBox(40, 60, 300, 400);
  const cropped = fileOf(await src.save(), 'crop.pdf');
  const out = await engine.createFromPages(cropped, [{ id: 'p0', index: 0, rot: 0, blank: false, w: 595.28, h: 841.89 }]);
  const doc = await PDFLib.PDFDocument.load(out);
  const box = doc.getPage(0).getCropBox();
  assertEqual(
    [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)],
    [40, 60, 300, 400],
    '导出页的裁剪框'
  );
});

done('页面整理测试');
