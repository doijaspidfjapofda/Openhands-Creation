# AGENTS.md

## 项目位置

应用在 `ui-source/pdf-tool-ui/`。所有命令都在该目录执行。

## 常用命令

```bash
npm install          # 开发依赖：pdfjs-dist 3.11.174 / playwright 1.49.1 / electron 33.2.1
npm start            # 本机服务 http://127.0.0.1:5173/index.html
npm test             # 合并/拆分/整理/转换/桌面外壳/隐私检查
npm run test:e2e     # 追加 Chromium 端到端测试（需先 npx playwright install chromium）
npm run package:win  # @electron/packager 交叉生成 Windows x64 便携目录 + ZIP
node scripts/make-icon.mjs  # 重新生成 desktop/icon.ico
```

## 结构约定

- `assets/pdf-pages.js`：纯页面模型逻辑（旋转、删除、插入空白、移动、拆分分组、历史栈）。改动页面行为先改这里并加测试。
- `assets/pdf-engine.js`：用 pdf-lib 写 PDF（合并 / 按页模型导出 / 拆分），错误对象带 `code`。
- `assets/pdf-convert.js`：PDF↔图片、PDF→文本；`items` 描述输出页序，空白页用 `{blank:{w,h}}`。
- `assets/app.js`：界面状态机与保存流程。`IMPLEMENTED_TOOLS` 决定哪些工具真正可执行，未列入的工具必须返回 `notready`。
- `tests/harness.mjs`：在 Node 的 `vm` 中加载 `vendor/pdf-lib.min.js` 与应用模块；用 pdfjs-dist 校验输出。

## 约束

- 不引入任何运行时 CDN 或远程请求；`tests/privacy.test.mjs` 会静态检查 `fetch`/XHR/远程资源。
- 不要为未实现的功能写“完成”状态；界面必须区分演示、未接入与真实结果。
- 生成 Windows 产物只在 `dist/`（已 gitignore），不要提交二进制。
