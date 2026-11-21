# 纸间 PDF（Openhands-Creation 工作区）

本仓库用于开发一款**仅在本机运行**的 PDF 工具：不上传文件、不调用云端处理接口、不含遥测。

## 仓库内容

| 路径 | 说明 |
| --- | --- |
| `ui-source/pdf-tool-ui/` | 应用主体：界面、本机处理引擎、桌面外壳、测试与打包脚本 |
| `本地PDF工具_UI开发需求文档.md` | 早期 UI 需求文档（产品方向参考） |
| `pdf-tool-ui.rar` | 需求方提供的主代码压缩包（已解压到上述目录，保留原包备查） |

应用的功能状态、限制、测试方式和 Windows 产物说明见
[`ui-source/pdf-tool-ui/README.md`](ui-source/pdf-tool-ui/README.md)。

## 快速开始

```bash
cd ui-source/pdf-tool-ui
npm install        # 仅开发/测试依赖；运行时不依赖 npm 包
npm start          # 启动本机服务：http://127.0.0.1:5173/index.html
npm test           # 逻辑、隐私与桌面外壳测试
npm run test:e2e   # 追加真实浏览器端到端测试
npm run package:win  # 生成 dist/纸间PDF-win32-x64/ 与 ZIP
```

Windows 便携版产物（不提交到版本库，需在本机生成）：

- `ui-source/pdf-tool-ui/dist/纸间PDF-win32-x64/纸间PDF.exe`
- `ui-source/pdf-tool-ui/dist/纸间PDF-windows-x64.zip`

## 当前状态

已接入并在测试中验证：打开/预览、合并、拆分与提取、页面整理（排序/旋转/复制/删除/空白页/撤销重做）、
PDF→图片、图片→PDF、PDF→文本，全部结果另存为新文件。

压缩、原文编辑、批注/签名、表单、对比、密码保护与脱敏仍为“尚未接入”，界面会明确标注且不会写出文件；
具体原因见应用 README。
