/* 端到端测试：用真实浏览器打开界面、处理真实 PDF，并检查保存下来的文件。 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { APP_ROOT, makePdf, makePng, inspect, assert, assertEqual } from './harness.mjs';

const require = createRequire(import.meta.url);
const JSZip = require(path.join(APP_ROOT, 'vendor/jszip.min.js'));

const { test, done } = createRunnerLocal();
console.log('\n[浏览器端到端]');

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zj-e2e-'));
const server = spawn(process.execPath, ['server.js'], {
  cwd: APP_ROOT,
  env: { ...process.env, PORT: '5199', NO_OPEN: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let baseUrl = '';
server.stdout.on('data', (buf) => {
  const m = String(buf).match(/http:\/\/127\.0\.0\.1:\d+\/index\.html/);
  if (m && !baseUrl) baseUrl = m[0];
});

const ready = await waitFor(() => baseUrl, 15000);
if (!ready) {
  console.error('本地服务器没有启动，跳过浏览器测试');
  server.kill();
  process.exit(1);
}

const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => {
  try { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }); } catch (e) {}
});
/* 阻断所有非本机请求，模拟断网环境：应用若依赖 CDN 就会失败 */
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:') || url.startsWith('blob:') || url.startsWith('data:')) {
    return route.continue();
  }
  return route.abort();
});

const page = await context.newPage();

const external = [];
const pageErrors = [];
page.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('http://127.0.0.1:') && !url.startsWith('http://localhost:') && !url.startsWith('blob:') && !url.startsWith('data:')) external.push(url);
});
page.on('pageerror', (err) => pageErrors.push(err.message));

await page.goto(baseUrl, { waitUntil: 'load' });

async function waitUntil(fn, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('等待页面条件超时');
}

const SRC = await makePdf([
  { text: 'E2E-PAGE-1' }, { text: 'E2E-PAGE-2' }, { text: 'E2E-PAGE-3' }, { text: 'E2E-PAGE-4' }
]);
const MERGE_A = await makePdf([{ text: 'MA-1' }, { text: 'MA-2' }]);
const MERGE_B = await makePdf([{ text: 'MB-1' }, { text: 'MB-2' }, { text: 'MB-3' }]);

async function saveDownload(trigger) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), trigger()]);
  const file = path.join(tmp, download.suggestedFilename());
  await download.saveAs(file);
  return { file, name: download.suggestedFilename(), bytes: await fs.readFile(file) };
}

await test('断网环境下界面仍能加载（所有资源均在本机）', async () => {
  const status = await page.textContent('#sbStatus');
  assert(/本机|就绪/.test(status), '状态栏文字：' + status);
  const html = await page.content();
  assert(!/https?:\/\/(?!localhost)/.test(html.replace(/<link[^>]+>/g, '')), '页面不应引用远程资源');
});

await test('打开真实 PDF 后显示文件名、页数和缩略图', async () => {
  await page.setInputFiles('#fileInput', { name: 'e2e-sample.pdf', mimeType: 'application/pdf', buffer: Buffer.from(SRC) });
  await page.waitForSelector('#viewWorkspace:not([hidden])', { timeout: 30000 });
  await waitUntil(() => document.querySelector('#wsFileName').textContent === 'e2e-sample.pdf');
  await waitUntil(() => document.querySelectorAll('#thumbList .thumb').length === 4);
  const sub = await page.textContent('#wsFileSub');
  assert(/4 页/.test(sub), '页数显示：' + sub);
});

await test('页面整理：旋转第一页并另存，导出文件真实反映旋转', async () => {
  await page.click('[data-pageact="rotate-r"]');
  await page.waitForTimeout(150);
  await page.click('[data-run="organize"]');
  await page.waitForSelector('[data-dlg-ok]');
  const saved = await saveDownload(() => page.click('[data-dlg-ok]'));
  const info = await inspect(saved.bytes);
  assertEqual(info.pageCount, 4, '导出页数');
  assertEqual(info.pages[0].rotate, 90, '第 1 页旋转');
  assertEqual(info.pages[1].rotate, 0, '第 2 页未旋转');
  assert(/e2e-sample_已整理\.pdf$/.test(saved.name), '默认文件名应基于原文件名：' + saved.name);
});

await test('撤销后导出恢复到原始状态', async () => {
  await page.click('#btnUndo');
  await page.waitForTimeout(150);
  await page.click('[data-run="organize"]');
  await page.waitForSelector('[data-dlg-ok]');
  const saved = await saveDownload(() => page.click('[data-dlg-ok]'));
  const info = await inspect(saved.bytes);
  assertEqual(info.pages[0].rotate, 0, '撤销后的旋转角');
});

await test('删除页面后导出页数减少（撤销可恢复）', async () => {
  await page.click('[data-pageact="del"]');
  await page.waitForSelector('[data-dlg-ok]');
  await page.click('[data-dlg-ok]');
  await page.waitForTimeout(200);
  await page.click('[data-run="organize"]');
  await page.waitForSelector('[data-dlg-ok]');
  const saved = await saveDownload(() => page.click('[data-dlg-ok]'));
  const info = await inspect(saved.bytes);
  assertEqual(info.pageCount, 3, '删除后的导出页数');
  await page.click('#btnUndo');
});

await test('拖动缩略图排序后导出顺序随之改变', async () => {
  await page.setInputFiles('#fileInput', { name: 'drag.pdf', mimeType: 'application/pdf', buffer: Buffer.from(SRC) });
  await waitUntil(() => document.querySelector('#wsFileName').textContent === 'drag.pdf'
    && document.querySelectorAll('#thumbList .thumb').length === 4
    && /就绪/.test(document.querySelector('#sbStatus').textContent));

  const src = await page.locator('#thumbList .thumb[data-idx="0"]').boundingBox();
  const dst = await page.locator('#thumbList .thumb[data-idx="2"]').boundingBox();
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2 + 12, { steps: 3 });
  await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height * 0.8, { steps: 15 });
  await page.mouse.up();
  await waitUntil(() => /已移动页面/.test(document.querySelector('#toastStack').textContent || ''));

  const saved = await saveDownload(async () => {
    await page.click('[data-run="organize"]');
    await page.waitForSelector('[data-dlg-ok]');
    await page.click('[data-dlg-ok]');
  });
  const info = await inspect(saved.bytes);
  assertEqual(info.pageCount, 4, '导出页数');
  assertEqual(info.pages.map((p) => p.text), ['E2E-PAGE-2', 'E2E-PAGE-3', 'E2E-PAGE-1', 'E2E-PAGE-4'], '拖动后的页序');

  await page.setInputFiles('#fileInput', { name: 'e2e-sample.pdf', mimeType: 'application/pdf', buffer: Buffer.from(SRC) });
  await waitUntil(() => document.querySelector('#wsFileName').textContent === 'e2e-sample.pdf'
    && document.querySelectorAll('#thumbList .thumb').length === 4
    && /就绪/.test(document.querySelector('#sbStatus').textContent));
});

const BIG = await makePdf(Array.from({ length: 120 }, (_, i) => ({ text: 'BIG-' + (i + 1) })));

await test('BUG-05 大文档打开时显示已读取页数', async () => {
  await page.evaluate(() => {
    window.__statusLog = [];
    const el = document.querySelector('#sbStatus');
    new MutationObserver(() => window.__statusLog.push(el.textContent)).observe(el, { childList: true, subtree: true, characterData: true });
  });
  await page.setInputFiles('#fileInput', { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.from(BIG) });
  await waitUntil(() => document.querySelector('#wsFileName').textContent === 'big.pdf'
    && /就绪/.test(document.querySelector('#sbStatus').textContent), 90000);
  const log = await page.evaluate(() => window.__statusLog);
  assert(log.some((t) => /\/ 120 页/.test(t)), '状态栏应显示读取进度，实际记录：' + JSON.stringify(log.slice(0, 6)));
});

await test('BUG-02 大文档：全部页面都有缩略图，可把第 100 页移到第 1 位', async () => {
  const count = await page.evaluate(() => document.querySelectorAll('#thumbList .thumb').length);
  assertEqual(count, 120, '缩略图数量（不应再截断到 80）');
  const listText = await page.evaluate(() => document.querySelector('#thumbList').textContent);
  assert(!/仅显示前/.test(listText), '不应再出现截断提示');

  await page.locator('#thumbList .thumb[data-idx="99"]').scrollIntoViewIfNeeded();
  await page.click('#thumbList .thumb[data-idx="99"]');
  await page.fill('#moveToPage', '1');
  await page.click('[data-pageact="move"]');
  await waitUntil(() => /已移动页面到第 1 位/.test(document.querySelector('#toastStack').textContent || ''));

  const saved = await saveDownload(async () => {
    await page.click('[data-run="organize"]');
    await page.waitForSelector('[data-dlg-ok]');
    await page.click('[data-dlg-ok]');
  });
  const info = await inspect(saved.bytes);
  assertEqual(info.pageCount, 120, '导出页数');
  assertEqual(info.pages[0].text, 'BIG-100', '第 1 页应是被移动的页');
  assertEqual(info.pages[1].text, 'BIG-1', '原第 1 页顺延到第 2 位');
});

await test('BUG-03 不用拖拽也能排序：上移 / 下移 / 移到指定页与快捷键', async () => {
  await page.setInputFiles('#fileInput', { name: 'e2e-sample.pdf', mimeType: 'application/pdf', buffer: Buffer.from(SRC) });
  await waitUntil(() => document.querySelector('#wsFileName').textContent === 'e2e-sample.pdf'
    && document.querySelectorAll('#thumbList .thumb').length === 4
    && /就绪/.test(document.querySelector('#sbStatus').textContent));

  await page.click('#thumbList .thumb[data-idx="2"]');
  await page.click('[data-pageact="up"]');
  await page.click('[data-pageact="up"]');
  await page.keyboard.press('Alt+ArrowDown');
  await waitUntil(() => /已移动页面到第 2 位/.test(document.querySelector('#toastStack').textContent || ''));

  const saved = await saveDownload(async () => {
    await page.click('[data-run="organize"]');
    await page.waitForSelector('[data-dlg-ok]');
    await page.click('[data-dlg-ok]');
  });
  const info = await inspect(saved.bytes);
  assertEqual(info.pages.map((p) => p.text), ['E2E-PAGE-1', 'E2E-PAGE-3', 'E2E-PAGE-2', 'E2E-PAGE-4'], '按钮与快捷键排序结果');

  await page.setInputFiles('#fileInput', { name: 'e2e-sample.pdf', mimeType: 'application/pdf', buffer: Buffer.from(SRC) });
  await waitUntil(() => document.querySelector('#wsFileName').textContent === 'e2e-sample.pdf'
    && document.querySelectorAll('#thumbList .thumb').length === 4
    && /就绪/.test(document.querySelector('#sbStatus').textContent));
});

await test('BUG-04 合并顺序不可撤销的说明可见，下移按钮可用', async () => {
  await page.click('.nav-item[data-tool="merge"]');
  await page.waitForSelector('[data-panel="merge"]:not([hidden])');
  const hint = await page.textContent('#mergeOrderHint');
  assert(/不支持撤销/.test(hint), '合并面板应说明顺序不可撤销：' + hint);
  await page.setInputFiles('#fileInput', [
    { name: 'ma.pdf', mimeType: 'application/pdf', buffer: Buffer.from(MERGE_A) },
    { name: 'mb.pdf', mimeType: 'application/pdf', buffer: Buffer.from(MERGE_B) }
  ]);
  await waitUntil(() => document.querySelectorAll('#mergeFiles .file-item').length === 2);
  await page.click('#mergeFiles .file-item[data-mfi="0"] [data-mfdown]');
  const names = await page.evaluate(() => Array.from(document.querySelectorAll('#mergeFiles .fi-name')).map((n) => n.textContent));
  assertEqual(names, ['mb.pdf', 'ma.pdf'], '下移后的列表顺序');
  await page.click('#mergeFiles .file-item[data-mfi="0"] [data-mfup]');
  await page.click('#mergeFiles .file-item[data-mfi="1"] [data-mfdel]');
  await page.click('#mergeFiles .file-item[data-mfi="0"] [data-mfdel]');
  await waitUntil(() => document.querySelectorAll('#mergeFiles .file-item').length === 0);
});

await test('拆分：按页码范围生成 ZIP，解压后页数正确', async () => {
  await page.click('.nav-item[data-tool="split"]');
  await page.waitForSelector('[data-panel="split"]:not([hidden])');
  await page.fill('#pageRange', '1-2');
  await page.waitForTimeout(100);
  const saved = await saveDownload(() => page.click('[data-run="split"]'));
  assert(/\.zip$/.test(saved.name), '拆分结果应为 ZIP：' + saved.name);
  const zip = await JSZip.loadAsync(saved.bytes);
  const names = Object.keys(zip.files).filter((n) => /\.pdf$/.test(n));
  assertEqual(names.length, 1, 'ZIP 内 PDF 数量');
  const info = await inspect(await zip.file(names[0]).async('uint8array'));
  assertEqual(info.pageCount, 2, '拆分文件页数');
  assertEqual(info.pages.map((p) => p.text), ['E2E-PAGE-1', 'E2E-PAGE-2'], '拆分文件内容');
});

await test('合并：两个本机 PDF 按列表顺序合并', async () => {
  await page.click('.nav-item[data-tool="merge"]');
  await page.waitForSelector('[data-panel="merge"]:not([hidden])');
  await page.setInputFiles('#fileInput', [
    { name: 'ma.pdf', mimeType: 'application/pdf', buffer: Buffer.from(MERGE_A) },
    { name: 'mb.pdf', mimeType: 'application/pdf', buffer: Buffer.from(MERGE_B) }
  ]);
  await waitUntil(() => document.querySelectorAll('#mergeFiles .file-item').length === 2);
  const saved = await saveDownload(() => page.click('[data-run="merge"]'));
  const info = await inspect(saved.bytes);
  assertEqual(info.pageCount, 5, '合并页数');
  assertEqual(info.pages.map((p) => p.text), ['MA-1', 'MA-2', 'MB-1', 'MB-2', 'MB-3'], '合并顺序');
});

await test('转换：PDF → 图片生成 ZIP，页数与像素尺寸正确', async () => {
  await page.click('.nav-item[data-tool="convert"]');
  await page.waitForSelector('[data-panel="convert"]:not([hidden])');
  await page.click('#convDir [data-dir="pdf2img"]');
  await page.selectOption('#convDpi', '150');
  const saved = await saveDownload(() => page.click('[data-run="convert"]'));
  assert(/\.zip$/.test(saved.name), '图片输出应为 ZIP：' + saved.name);
  const zip = await JSZip.loadAsync(saved.bytes);
  const names = Object.keys(zip.files).filter((n) => /\.png$/.test(n)).sort();
  assertEqual(names.length, 4, 'ZIP 内 PNG 数量');
  const png = await zip.file(names[0]).async('uint8array');
  assertEqual(Array.from(png.slice(0, 4)), [0x89, 0x50, 0x4e, 0x47], 'PNG 文件头');
  const width = (png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19];
  const height = (png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23];
  assert(Math.abs(width - 1240) <= 2 && Math.abs(height - 1754) <= 2, 'A4 在 150 DPI 下的像素尺寸，实际 ' + width + 'x' + height);
});

await test('转换：PDF → 文本导出 .txt，包含页面文字', async () => {
  await page.click('#convDir [data-dir="pdf2txt"]');
  const saved = await saveDownload(() => page.click('[data-run="convert"]'));
  assert(/\.txt$/.test(saved.name), '文本输出应为 .txt：' + saved.name);
  const text = saved.bytes.toString('utf8');
  assert(/E2E-PAGE-1/.test(text) && /E2E-PAGE-4/.test(text), '文本应包含各页文字');
});

await test('转换：图片 → PDF 按顺序生成两页', async () => {
  await page.click('#convDir [data-dir="img2pdf"]');
  await page.waitForSelector('#convImgGroup:not([hidden])');
  await page.setInputFiles('#imgInput', [
    { name: 'wide.png', mimeType: 'image/png', buffer: Buffer.from(makePng(300, 200)) },
    { name: 'tall.png', mimeType: 'image/png', buffer: Buffer.from(makePng(200, 400)) }
  ]);
  await waitUntil(() => document.querySelectorAll('#convImgList .result-item').length === 2);
  const saved = await saveDownload(() => page.click('[data-run="convert"]'));
  const info = await inspect(saved.bytes);
  assertEqual(info.pageCount, 2, '图片 PDF 页数');
  assertEqual([Math.round(info.pages[0].width), Math.round(info.pages[0].height)], [842, 595], '横向图片页');
  assertEqual([Math.round(info.pages[1].width), Math.round(info.pages[1].height)], [595, 842], '纵向图片页');
});

await test('未接入的工具不会生成文件，也不会显示虚假完成', async () => {
  await page.click('.nav-item[data-tool="compress"]');
  await page.waitForSelector('[data-panel="compress"]:not([hidden])');
  const download = await Promise.race([
    page.waitForEvent('download', { timeout: 1500 }).catch(() => null),
    page.click('[data-run="compress"]').then(() => null)
  ]);
  assert(!download, '未接入的工具不应触发保存');
  const panelText = await page.textContent('[data-panel="compress"]');
  assert(/尚未接入|未接入|不可用/.test(panelText), '面板应显示未接入状态');
});

await test('运行期间没有向外部服务发出请求', async () => {
  assertEqual(external, [], '外部请求');
  assertEqual(pageErrors, [], '页面脚本错误');
});

await test('界面在没有系统保存窗口时回退为浏览器下载', async () => {
  const hasPicker = await page.evaluate(() => typeof window.showSaveFilePicker);
  assertEqual(hasPicker, 'undefined', '测试环境应禁用系统保存窗口');
});

await browser.close();
server.kill();
await fs.rm(tmp, { recursive: true, force: true });
done('端到端测试');

function createRunnerLocal() {
  const results = [];
  async function test(name, fn) {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log('  ✓ ' + name);
    } catch (err) {
      results.push({ name, ok: false });
      console.log('  ✗ ' + name + '\n    ' + (err && err.message ? err.message : err));
      process.exitCode = 1;
    }
  }
  function done(suite) {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${suite}: ${results.length - failed.length}/${results.length} 通过`);
    if (failed.length) process.exitCode = 1;
  }
  return { test, done };
}

async function waitFor(fn, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
