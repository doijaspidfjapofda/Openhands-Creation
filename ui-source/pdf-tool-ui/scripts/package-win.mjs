/* 用 @electron/packager 生成 Windows x64 便携目录，并打包为 ZIP。
   不签名、不发布；产物只放在本机 dist/ 目录。 */
import { packager } from '@electron/packager';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = require(path.join(ROOT, 'package.json'));
const APP_NAME = '纸间PDF';

const paths = await packager({
  dir: ROOT,
  name: APP_NAME,
  platform: 'win32',
  arch: 'x64',
  out: path.join(ROOT, 'dist'),
  overwrite: true,
  asar: true,
  prune: true,
  icon: fs.existsSync(path.join(ROOT, 'desktop', 'icon.ico')) ? path.join(ROOT, 'desktop', 'icon.ico') : undefined,
  ignore: [
    /^\/dist($|\/)/,
    /^\/tests($|\/)/,
    /^\/preview($|\/)/,
    /^\/node_modules($|\/)/,
    /^\/scripts($|\/)/,
    /^\/package-lock\.json$/,
    /^\/\.git($|\/)/
  ],
  win32metadata: {
    CompanyName: '纸间 PDF',
    FileDescription: '纸间 PDF · 本机 PDF 工具',
    ProductName: '纸间 PDF',
    InternalName: APP_NAME
  }
});

const JSZip = require(path.join(ROOT, 'vendor', 'jszip.min.js'));

const GUIDE = `纸间 PDF · Windows 便携版
================================

启动
  双击「${APP_NAME}.exe」即可打开应用窗口，不需要安装 Node.js，
  也不需要打开命令行。

文件处理位置
  所有 PDF 与图片都只在这台电脑上读写。应用不包含上传入口、
  云端处理接口、账号登录或遥测，运行时不需要联网。

可以做的事
  · 打开、预览本机 PDF
  · 合并多个 PDF（可调整顺序、插入空白分隔页）
  · 拆分与提取（页码范围、每 N 页、选中页）
  · 页面整理（排序、旋转、复制、删除、空白页、撤销/重做）
  · 转换（PDF 转图片、图片转 PDF、PDF 转文本）

保存结果
  点击“保存为新文件”会弹出 Windows 的“另存为”窗口，可以自己选文件名
  和位置。原文件不会被覆盖。合并、页面整理和图片转 PDF 输出 PDF；
  拆分和 PDF 转图片输出 ZIP；PDF 转文本输出 .txt。

已知限制
  · 带打开密码的 PDF 需要先在其他阅读器中解锁。
  · 导出只复制页面内容；书签、表单字段、数字签名、链接和部分
    元数据可能不会保留。
  · 压缩、编辑原文、批注、表单填写、密码保护与脱敏尚未接入，
    界面会明确标注，不会生成假结果。

本目录中的 LICENSE、LICENSES.chromium.html 是 Electron 与 Chromium
的授权文件；应用内的 PDF.js、pdf-lib、JSZip 授权文本位于 vendor/。
`;

for (const out of paths) {
  console.log('已生成：' + out);
  const exe = path.join(out, APP_NAME + '.exe');
  console.log(fs.existsSync(exe) ? '可执行文件：' + exe : '未找到 exe，请检查打包输出');
  fs.writeFileSync(path.join(out, '使用说明.txt'), GUIDE, 'utf8');

  const zip = new JSZip();
  const walk = (dir, base) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = base ? base + '/' + entry.name : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else zip.file(rel, fs.readFileSync(full));
    }
  };
  walk(out, APP_NAME + '-win32-x64');
  const zipPath = path.join(ROOT, 'dist', APP_NAME + '-windows-x64.zip');
  const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  fs.writeFileSync(zipPath, data);
  console.log('便携压缩包：' + zipPath + '（' + (data.length / 1024 / 1024).toFixed(1) + ' MB）');
}
