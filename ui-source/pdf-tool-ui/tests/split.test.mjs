import { app, makePdf, fileOf, inspect, createRunner, assert, assertEqual } from './harness.mjs';

const { engine, pages: ZJPages } = app;
const { test, done } = createRunner();
console.log('\n[拆分与提取]');

const TEN = await makePdf(Array.from({ length: 10 }, (_, i) => ({ text: 'PAGE-' + (i + 1) })));
const file = fileOf(TEN, 'ten.pdf');

async function exportGroups(groups) {
  const out = [];
  for (const g of groups) {
    const models = g.indexes.map((i) => ({ id: 'p' + i, index: i, rot: 0, blank: false }));
    out.push(await engine.createFromPages(file, models));
  }
  return out;
}

await test('页码范围拆分：1-3, 5, 8-10 生成 3 个文件，页数 3/1/3', async () => {
  const groups = ZJPages.buildSplitGroups({ mode: 'range', total: 10, rangeText: '1-3, 5, 8-10' });
  assertEqual(groups.map((g) => g.indexes.length), [3, 1, 3], '分组页数');
  const outs = await exportGroups(groups);
  const infos = await Promise.all(outs.map((o) => inspect(o)));
  assertEqual(infos.map((i) => i.pageCount), [3, 1, 3], '导出文件页数');
  assertEqual(infos[1].pages[0].text, 'PAGE-5', '第二个文件内容');
  assertEqual(infos[2].pages.map((p) => p.text), ['PAGE-8', 'PAGE-9', 'PAGE-10'], '第三个文件内容');
});

await test('中文逗号与空格同样可用', async () => {
  const groups = ZJPages.buildSplitGroups({ mode: 'range', total: 10, rangeText: ' 1 - 2 ， 4 ' });
  assertEqual(groups.map((g) => g.indexes), [[0, 1], [3]], '分组结果');
});

await test('每 N 页拆分：10 页按 4 页一份得到 4/4/2', async () => {
  const groups = ZJPages.buildSplitGroups({ mode: 'every', total: 10, everyN: 4 });
  assertEqual(groups.map((g) => g.indexes.length), [4, 4, 2], '分组页数');
  const infos = await Promise.all((await exportGroups(groups)).map((o) => inspect(o)));
  assertEqual(infos.map((i) => i.pageCount), [4, 4, 2], '导出页数');
  assertEqual(infos[2].pages.map((p) => p.text), ['PAGE-9', 'PAGE-10'], '最后一份内容');
});

await test('每 N 页拆分：N 大于总页数时只产生一个文件', async () => {
  const groups = ZJPages.buildSplitGroups({ mode: 'every', total: 3, everyN: 99 });
  assertEqual(groups.length, 1, '分组数量');
  assertEqual(groups[0].indexes.length, 3, '分组页数');
});

await test('提取选中页：按文档顺序输出，忽略重复选择', async () => {
  const groups = ZJPages.buildSplitGroups({ mode: 'picked', total: 10, sel: [5, 0, 2, 2] });
  assertEqual(groups.length, 1, '只生成一个文件');
  assertEqual(groups[0].indexes, [0, 2, 5], '按文档顺序排列');
  const info = await inspect((await exportGroups(groups))[0]);
  assertEqual(info.pages.map((p) => p.text), ['PAGE-1', 'PAGE-3', 'PAGE-6'], '提取内容');
});

await test('未选择任何页面时给出明确错误', async () => {
  let err = null;
  try { ZJPages.buildSplitGroups({ mode: 'picked', total: 10, sel: [] }); } catch (e) { err = e; }
  assert(err && /选择要提取的页面/.test(err.message), '应提示先选择页面');
});

const invalidCases = [
  ['空输入', { mode: 'range', total: 10, rangeText: '' }, /至少一个页码/],
  ['页码 0', { mode: 'range', total: 10, rangeText: '0-2' }, /超出当前文档范围/],
  ['超出总页数', { mode: 'range', total: 10, rangeText: '9-11' }, /超出当前文档范围/],
  ['起始大于结束', { mode: 'range', total: 10, rangeText: '5-3' }, /起始页大于结束页/],
  ['范围重叠', { mode: 'range', total: 10, rangeText: '1-3, 2-4' }, /重叠/],
  ['非数字', { mode: 'range', total: 10, rangeText: 'abc' }, /无法识别页码/],
  ['每份页数为 0', { mode: 'every', total: 10, everyN: 0 }, /大于 0 的整数/],
  ['每份页数为小数', { mode: 'every', total: 10, everyN: '2.5' }, /大于 0 的整数/],
  ['空文档', { mode: 'every', total: 0, everyN: 2 }, /没有可拆分的页面/]
];

for (const [name, opts, pattern] of invalidCases) {
  await test('参数校验：' + name, async () => {
    let err = null;
    try { ZJPages.buildSplitGroups(opts); } catch (e) { err = e; }
    assert(err, '应当抛出错误');
    assert(pattern.test(err.message), '错误提示应匹配 ' + pattern + '，实际：' + err.message);
  });
}

await test('拆分导出不会修改原文件，且每个结果都能重新打开', async () => {
  const before = Buffer.from(TEN).toString('base64');
  const groups = ZJPages.buildSplitGroups({ mode: 'every', total: 10, everyN: 3 });
  const outs = await exportGroups(groups);
  assertEqual(Buffer.from(TEN).toString('base64'), before, '原文件字节');
  for (const out of outs) {
    const info = await inspect(out);
    assert(info.pageCount > 0, '每个输出都应包含页面');
  }
});

await test('拆分使用当前页面顺序（整理后的顺序），而不是原始页码', async () => {
  const models = [
    { id: 'a', index: 4, rot: 0, blank: false },
    { id: 'b', index: 0, rot: 0, blank: false },
    { id: 'c', index: 9, rot: 0, blank: false }
  ];
  const info = await inspect(await engine.createFromPages(file, models));
  assertEqual(info.pages.map((p) => p.text), ['PAGE-5', 'PAGE-1', 'PAGE-10'], '按整理后的顺序导出');
});

done('拆分测试');
