/* 在真实 Electron 桌面窗口里跑完整流程：阅读、页面管理、三种转换、保存与隐私检查。
   需要显示环境；在无显示器环境用 `xvfb-run -a node tests/electron.test.mjs`。 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright';
import { APP_ROOT, makePdf, makePng, inspect, createRunner, assert, assertEqual } from './harness.mjs';

const require = createRequire(import.meta.url);
const JSZip = require(path.join(APP_ROOT, 'vendor/jszip.min.js'));

const { test, done } = createRunner();
console.log('\n[桌面应用完整流程]');

const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zj-electron-'));

/* ZJ_APP_TARGET 可指向打包后的 app.asar，用于验证发布包本身 */
const target = process.env.ZJ_APP_TARGET || '.';
const app = await electron.launch({
  args: ['--no-sandbox', target],
  cwd: APP_ROOT,
  env: { ...process.env, NO_OPEN: '1' }
});

const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');

await app.evaluate(({ dialog, session }, dir) => {
  const base = String(dir).replace(/[\\/]+$/, '');
  session.defaultSession.on('will-download', (event, item) => {
    item.setSavePath(base + '/' + item.getFilename());
  });
  /* 只替换系统“另存为”对话框，文件写入仍走应用自身的 IPC 处理逻辑 */
  dialog.showSaveDialog = async (win, options) => {
    const suggested = String((options && options.defaultPath) || 'output').split(/[\\/]/).pop();
    return { canceled: false, filePath: base + '/' + suggested };
  };
}, downloadDir);

const external = [];
const pageErrors = [];
page.on('request', (req) => {
  const url = req.url();
  if (!/^http:\/\/127\.0\.0\.1:/.test(url) && !url.startsWith('blob:') && !url.startsWith('data:') && !url.startsWith('devtools:')) {
    external.push(url);
  }
});
page.on('pageerror', (err) => pageErrors.push(err.message));

const SRC = await makePdf([
  { text: 'WIN-PAGE-1' }, { text: 'WIN-PAGE-2' }, { text: 'WIN-PAGE-3' }, { text: 'WIN-PAGE-4' }
]);

async function waitForFile(pattern, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const names = await fs.readdir(downloadDir);
    const hit = names.find((n) => pattern.test(n));
    if (hit) {
      await new Promise((r) => setTimeout(r, 150));
      return { name: hit, bytes: await fs.readFile(path.join(downloadDir, hit)) };
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('等待文件超时：' + pattern + '，目录内容：' + (await fs.readdir(downloadDir)).join(', '));
}

await test('桌面窗口启动并加载本机界面', async () => {
  const url = page.url();
  assert(/^http:\/\/127\.0\.0\.1:\d+\/index\.html$/.test(url), '窗口地址：' + url);
  const title = await page.title();
  assert(/纸间 PDF/.test(title), '窗口标题：' + title);
  assertEqual(await page.evaluate(() => typeof window.require), 'undefined', '渲染进程不应暴露 require');
  assertEqual(await page.evaluate(() => typeof window.ZJEngine), 'object', '本机引擎应已加载');
});

await test('PDF 阅读：页数、翻页、跳页与缩放', async () => {
  await page.setInputFiles('#fileInput', { name: 'desktop.pdf', mimeType: 'application/pdf', buffer: Buffer.from(SRC) });
  await page.waitForSelector('#viewWorkspace:not([hidden])', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#thumbList .thumb').length === 4, null, { timeout: 30000 });
  assertEqual((await page.textContent('#pageTotal')).trim(), '4', '总页数');

  await page.click('#pageNext');
  assertEqual(await page.inputValue('#pageInput'), '2', '下一页');

  await page.fill('#pageInput', '3');
  await page.press('#pageInput', 'Enter');
  await page.waitForTimeout(300);
  assertEqual(await page.inputValue('#pageInput'), '3', '跳转到第 3 页');

  const before = await page.textContent('#zoomVal');
  await page.click('#zoomIn');
  await page.waitForTimeout(300);
  const after = await page.textContent('#zoomVal');
  assert(before !== after, '缩放值应变化：' + before + ' -> ' + after);
  await page.click('#zoomVal');
  await page.waitForTimeout(200);
});

await test('页面管理：旋转、复制、插入空白、删除、撤销/重做', async () => {
  await page.click('#thumbList .thumb');
  await page.waitForTimeout(150);
  await page.click('[data-pageact="rotate-r"]');
  await page.click('[data-pageact="dup"]');
  await page.waitForFunction(() => document.querySelectorAll('#thumbList .thumb').length === 5);

  await page.selectOption('#blankPos', 'after');
  await page.click('#btnInsertBlank');
  await page.waitForFunction(() => document.querySelectorAll('#thumbList .thumb').length === 6);

  await page.click('[data-pageact="del"]');
  await page.waitForSelector('[data-dlg-ok]');
  await page.click('[data-dlg-ok]');
  await page.waitForFunction(() => document.querySelectorAll('#thumbList .thumb').length === 5);

  await page.click('#btnUndo');
  await page.waitForFunction(() => document.querySelectorAll('#thumbList .thumb').length === 6);
  await page.click('#btnRedo');
  await page.waitForFunction(() => document.querySelectorAll('#thumbList .thumb').length === 5);
});

await test('页面整理另存：导出文件真实反映旋转与复制', async () => {
  await page.click('[data-run="organize"]');
  await page.waitForSelector('[data-dlg-ok]');
  await page.click('[data-dlg-ok]');
  const saved = await waitForFile(/已整理\.pdf$/);
  const info = await inspect(saved.bytes);
  assertEqual(info.pageCount, 5, '导出页数');
  assertEqual(info.pages[0].rotate, 90, '第 1 页旋转');
  assertEqual(info.pages[0].text, 'WIN-PAGE-1', '第 1 页内容');
  assertEqual(info.pages[1].text, 'WIN-PAGE-1', '第 2 页是复制页');
});

await test('PDF → 图片：桌面窗口内渲染并打包 ZIP', async () => {
  await page.click('.nav-item[data-tool="convert"]');
  await page.waitForSelector('[data-panel="convert"]:not([hidden])');
  await page.click('#convDir [data-dir="pdf2img"]');
  await page.selectOption('#convScope', 'current');
  await page.selectOption('#convDpi', '150');
  await page.click('[data-run="convert"]');
  const saved = await waitForFile(/_图片\.zip$/);
  const zip = await JSZip.loadAsync(saved.bytes);
  const names = Object.keys(zip.files).filter((n) => /\.png$/.test(n));
  assertEqual(names.length, 1, '当前页应输出 1 张图片');
  const png = await zip.file(names[0]).async('uint8array');
  assertEqual(Array.from(png.slice(0, 4)), [0x89, 0x50, 0x4e, 0x47], 'PNG 文件头');
});

await test('图片 → PDF：桌面窗口内合成两页', async () => {
  await page.click('#convDir [data-dir="img2pdf"]');
  await page.waitForSelector('#convImgGroup:not([hidden])');
  await page.setInputFiles('#imgInput', [
    { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(makePng(300, 200)) },
    { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(makePng(200, 300)) }
  ]);
  await page.waitForFunction(() => document.querySelectorAll('#convImgList .result-item').length === 2);
  await page.click('[data-run="convert"]');
  const saved = await waitForFile(/_图片\.pdf$/);
  const info = await inspect(saved.bytes);
  assertEqual(info.pageCount, 2, '图片 PDF 页数');
});

await test('PDF → 文本：导出 .txt 并包含页面文字', async () => {
  await page.click('#convDir [data-dir="pdf2txt"]');
  await page.selectOption('#convScope', 'all');
  await page.click('[data-run="convert"]');
  const saved = await waitForFile(/\.txt$/);
  const text = saved.bytes.toString('utf8');
  for (const marker of ['WIN-PAGE-1', 'WIN-PAGE-2', 'WIN-PAGE-3', 'WIN-PAGE-4']) {
    assert(text.includes(marker), '文本应包含 ' + marker + '，实际内容：' + JSON.stringify(text.slice(0, 200)));
  }
});

await test('未接入的工具不产生文件', async () => {
  await page.click('.nav-item[data-tool="compress"]');
  await page.waitForSelector('[data-panel="compress"]:not([hidden])');
  const before = (await fs.readdir(downloadDir)).length;
  await page.click('[data-run="compress"]');
  await page.waitForTimeout(1200);
  assertEqual((await fs.readdir(downloadDir)).length, before, '不应新增文件');
});

await test('运行期间没有外部请求或脚本错误', async () => {
  assertEqual(external, [], '外部请求');
  assertEqual(pageErrors, [], '页面脚本错误');
});

await app.close();
await fs.rm(downloadDir, { recursive: true, force: true });
done('桌面应用测试');
