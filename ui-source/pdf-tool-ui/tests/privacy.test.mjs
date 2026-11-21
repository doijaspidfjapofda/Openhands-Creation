/* 静态检查：运行时只用本机资源，没有上传或远程处理入口。 */
import fs from 'node:fs';
import path from 'node:path';
import { APP_ROOT, createRunner, assert, assertEqual } from './harness.mjs';

const { test, done } = createRunner();
console.log('\n[隐私与依赖]');

const appFiles = ['index.html', 'assets/app.js', 'assets/render.js', 'assets/pdf-engine.js', 'assets/pdf-pages.js', 'assets/pdf-convert.js', 'server.js'];
const source = {};
for (const f of appFiles) source[f] = fs.readFileSync(path.join(APP_ROOT, f), 'utf8');
const all = Object.values(source).join('\n');

await test('没有 fetch / XHR / WebSocket / sendBeacon 等联网调用', async () => {
  for (const [file, code] of Object.entries(source)) {
    const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/, /sendBeacon/, /new\s+EventSource/, /import\s*\(\s*['"]https?:/]) {
      assert(!pattern.test(stripped), file + ' 含有联网调用：' + pattern);
    }
  }
});

await test('页面只加载本机脚本与样式', async () => {
  const html = source['index.html'];
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  const remote = refs.filter((r) => /^(https?:)?\/\//.test(r));
  assertEqual(remote, [], '远程资源');
  assert(refs.includes('vendor/pdf.min.js') && refs.includes('vendor/pdf-lib.min.js') && refs.includes('vendor/jszip.min.js'), '应加载本地 vendor 组件');
  assert(refs.includes('assets/pdf-convert.js') && refs.includes('assets/pdf-pages.js'), '应加载本机处理模块');
});

await test('页面设置了内容安全策略（禁止外部脚本与 eval）', async () => {
  const html = source['index.html'];
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert(csp, '应包含 CSP meta');
  assert(/script-src 'self'/.test(csp[1]), '脚本只允许同源');
  assert(!/unsafe-eval/.test(csp[1]), '不应允许 eval');
  assert(/object-src 'none'/.test(csp[1]), '应禁用插件对象');
  assert(/form-action 'none'/.test(csp[1]), '应禁止表单提交');
});

await test('没有上传表单或云端处理入口', async () => {
  const html = source['index.html'];
  assert(!/<form\b/i.test(html), '界面不应包含提交表单');
  assert(!/type="submit"/i.test(html), '界面不应包含提交按钮');
  assert(!/(上传文件|选择文件上传|云端处理)\s*</i.test(html), '界面不应包含上传或云端处理入口');
  assert(!/api_key|apiKey|access[_-]?token/i.test(html), '界面不应包含凭据配置');
});

await test('依赖固定版本并保留授权文件', async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8'));
  assert(!pkg.dependencies || !Object.keys(pkg.dependencies).length, '运行时不依赖 npm 包');
  for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
    assert(/^\d+\.\d+\.\d+$/.test(version), name + ' 的版本应固定，实际 ' + version);
  }
  assert(fs.existsSync(path.join(APP_ROOT, 'vendor/pdf-lib-LICENSE.md')), 'pdf-lib 授权文件');
  assert(fs.existsSync(path.join(APP_ROOT, 'vendor/jszip-LICENSE.markdown')), 'JSZip 授权文件');
  for (const f of ['pdf.min.js', 'pdf.worker.min.js', 'pdf-lib.min.js', 'jszip.min.js']) {
    assert(fs.existsSync(path.join(APP_ROOT, 'vendor', f)), '缺少本地组件 ' + f);
  }
});

await test('本地服务器只监听 127.0.0.1，并阻止目录穿越', async () => {
  const code = source['server.js'];
  assert(/server\.listen\(port, '127\.0\.0\.1'/.test(code), '应只绑定本机回环地址');
  assert(/startsWith\(root\)/.test(code), '应校验请求路径位于项目目录内');
});

await test('未接入的工具被明确标记，且没有演示结果写入', async () => {
  const app = source['assets/app.js'];
  const implemented = app.match(/IMPLEMENTED_TOOLS = \{([^}]+)\}/)[1];
  const names = [...implemented.matchAll(/(\w+):\s*true/g)].map((m) => m[1]).sort();
  assertEqual(names, ['convert', 'merge', 'organize', 'split'], '已接入的工具');
  assert(/尚未接入/.test(source['index.html']) || /尚未接入/.test(app), '界面应标注未接入');
  assert(/state: 'notready'/.test(app), '未接入工具应返回 notready 状态');
  assert(/演示文档不能导出|演示样张只用于预览/.test(app), '演示文档不得导出');
});

done('隐私与依赖检查');
