# 仓库说明

## 目录

- `微信小程序交互原型开发交接包/`：产品方提供的 PRD、需求决策记录、HTML 参考原型。**只读参考，不要修改。**
- `weapp-dictation/`：原生微信小程序交互原型（交付物）。
- `weapp-dictation/docs/实现说明-PRD对照.md`：PRD 功能需求与代码落点对照。

## 常用命令

```bash
cd weapp-dictation
node scripts/check.js        # 工程结构、语法、WXML 标签、事件绑定自检
node tests/store.test.js     # 数据规则测试
node tests/flows.test.js     # 页面流程模拟测试
```

本环境没有微信开发者工具，无法真机预览；不要声称已完成真机验证。交付前至少跑完以上三条命令。

## 工程约定

- 原生 WXML / WXSS / JavaScript，无 npm 依赖。
- 数据规则集中在 `utils/store.js`，纯函数、不依赖 `wx`，可直接在 Node 测试。
- 本地状态与 Storage 只在 `utils/state.js`；页面不直接读写 Storage（练习待办列表除外）。
- 语音统一走 `utils/audio.js`，没有真实音频时进入明确标注的演示占位，不使用 `window.speechSynthesis`。
- 文案为中文、面向初中生与家长，避免幼儿化、排名、连续打卡等表达；演示数据必须标注「演示」。
- 待确认交互（自动播放控制、最后一词确认、答案查看、复习排程）在 README 中列为假设，不要写成已定稿。

## 关键业务规则

- 错词按学生档案隔离；写错入库、重复写错只累加、家长听写写对才移出、学生自主练习不移除。
- 未批改词不算正确；提前结束只保存已批改项。
- 草稿每次标记即保存；放弃草稿不影响历史与错词库。
