# AGENTS.md

## 项目位置

应用在 `ui-source/pdf-tool-ui/`。所有命令都在该目录执行。

## 常用命令

```bash
npm install          # 开发依赖：pdfjs-dist 3.11.174 / playwright 1.49.1 / electron 33.2.1
npm start            # 本机服务 http://127.0.0.1:5173/index.html
npm test             # 合并/拆分/整理/转换/桌面外壳/隐私检查
npm run test:e2e     # 追加 Chromium 端到端测试（需先 npx playwright install chromium）
npm run test:desktop # 真实 Electron 窗口完整流程（无显示器时 xvfb-run -a npm run test:desktop）
npm run package:win  # @electron/packager 交叉生成 Windows x64 便携目录 + ZIP
node scripts/make-icon.mjs  # 重新生成 desktop/icon.ico
```

## 结构约定

- `assets/pdf-pages.js`：纯页面模型逻辑（旋转、删除、插入空白、移动、拆分分组、历史栈）。改动页面行为先改这里并加测试。
- `assets/pdf-engine.js`：用 pdf-lib 写 PDF（合并 / 按页模型导出 / 拆分），错误对象带 `code`。
- `assets/pdf-convert.js`：PDF↔图片、PDF→文本；`items` 描述输出页序，空白页用 `{blank:{w,h}}`。
- `assets/app.js`：界面状态机与保存流程。`IMPLEMENTED_TOOLS` 决定哪些工具真正可执行，未列入的工具必须返回 `notready`。
- `tests/harness.mjs`：在 Node 的 `vm` 中加载 `vendor/pdf-lib.min.js` 与应用模块；用 pdfjs-dist 校验输出。
- `desktop/preload.js`：只通过 `contextBridge` 暴露 `zjDesktop.saveFile`，主进程用 `dialog.showSaveDialog` 写文件；
  桌面测试通过替换 `dialog.showSaveDialog` 把文件写到临时目录。
- `tests/electron.test.mjs`：支持 `ZJ_APP_TARGET=<app.asar>` 直接验证打包产物。

## 待办入口

- 缺陷与改进清单在仓库根目录 `PRD-改进与缺陷清单.md`。未确认前不要改代码；确认后按条目逐条实施，
  每条先补复现测试，改完更新该文件状态列并跑满 92 项回归。

## 桌面与界面经验

- 渲染进程的 `window.close()` 在 Electron 33 里直接销毁窗口，**不会**触发 `BrowserWindow` 的 `close` 事件；
  测试关窗拦截要用 `app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].close())`。
- 未保存状态由渲染进程通过 `zj:dirty` IPC 同步，主进程只保存一个布尔值；`did-finish-load` 时复位。
- 最近文件写入 `localStorage`（`zj.recent.v1`），只存元数据；桌面版用 `webUtils.getPathForFile` + `zj:read-file` 支持按路径重开。
- 触屏拖动走 Pointer 事件（`pointerType !== 'mouse'`），鼠标仍走 HTML5 拖放，两条路径不要同时提交移动。
- 缩略图用 `IntersectionObserver` 按可视区域绘制，离开视野时把 canvas 宽高清零但保留 CSS 尺寸，
  否则列表会因布局跳动导致拖动命中区域错位。

## 环境注意

- 页面带严格 CSP，Playwright 的 `page.waitForFunction` 会被 CSP 拒绝；测试里用 `waitUntil()` 轮询 `page.evaluate`。
- Wine 10 无法启动 Electron 33（主进程不监听端口），不要用 Wine 结论代替 Windows 实测。
- 打开文件期间 `S.loading` 为真，页面操作会被拒绝，避免操作落在即将被替换的旧页面上。

## 约束

- 不引入任何运行时 CDN 或远程请求；`tests/privacy.test.mjs` 会静态检查 `fetch`/XHR/远程资源。
- 不要为未实现的功能写“完成”状态；界面必须区分演示、未接入与真实结果。
- 生成 Windows 产物只在 `dist/`（已 gitignore），不要提交二进制。
