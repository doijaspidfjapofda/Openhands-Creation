# 实现说明：PRD 要求与原型对照

对照 `英语学习应用_PRD_MVP.md` 第 6 节功能需求，说明每条要求在原型中的落点。路径均相对 `weapp-dictation/`。

## 一、功能需求对照

| 编号 | 要求 | 实现位置 | 当前状态 |
|---|---|---|---|
| FR-01 | 教材词表浏览与选词 | `pages/setup/*`、`utils/words.js` | 已实现。年级 / 册别 / 版本 / Unit / 搜索；跨单元多选、全选当前列表、清空；数量实时更新 |
| FR-02 | 听写语言与出词顺序 | `pages/setup/*`、`utils/store.js#startDraft` | 已实现。中文提示 / 英文播报；教材顺序 / 随机打乱；草稿与历史保留设置 |
| FR-03 | 手动听写信息显示 | `pages/session/*` | 已实现。进入时单词、音标、释义默认可见；「家长查看答案 / 收起答案」一次性隐藏或恢复三项；大喇叭按钮按所选语言播报、可重播 |
| FR-04 | 手动逐词批改与自动前进 | `pages/session/session.js#onMark` | 已实现。标记即保存并前进；已标记项颜色提示；改标覆盖旧结果；保留「上一个」 |
| FR-05 | 进度与跳转 | `pages/session/*` | 已实现。顶部横向进度条、题号区三态（正确 / 错误 / 未批改）、点击题号跳转、计数实时更新 |
| FR-06 | 自动听写 | `pages/session/*`、`utils/store.js#startDraft` | 已实现。默认隐藏三项；2–15 秒间隔；开始后逐词播报；间隔从当前语音结束后计时 |
| FR-07 | 自动播放后集中批改 | `pages/session/*` | 已实现。播放阶段不要求标记；结束后「开始批改」进入逐词批改，复用 FR-04 / FR-05 规则 |
| FR-08 | 完成保护与部分完成 | `pages/session/*`、`utils/store.js#finishDraft` | 已实现。未标记不算对；结束前提示未批改数；提前结束只保存已批改项，未批改项不改变错词库 |
| FR-09 | 错词库状态迁移 | `utils/store.js#finishDraft` | 已实现。按档案隔离；重复写错只累加；写对移出但保留历史；学生练习不移除 |
| FR-10 | 家长与学生共用错词视图 | `pages/bank/*`、`utils/state.js` | 已实现。两个角色读取同一档案的同一份错词；切换档案不串档 |
| FR-11 | 学生拼写复习 | `pages/practice/*`、`pages/practice-result/*` | 已实现。看释义写拼写、首字母提示、提交后显示正确拼写 / 音标 / 例句；记录是否用提示与结果 |
| FR-12 | 听写历史 | `pages/history/*`、`pages/result/*` | 已实现。保留日期、播报方式、来源、已批改词与逐词结果；错词移出不删除历史 |
| FR-13 | 学生档案 | `components/app-header/*`、`utils/store.js#addChild` | 已实现。默认 1 个、最多 3 个；教材选择、错词、听写、练习按档案隔离 |
| FR-14 | 未完成听写恢复 | `pages/setup/*`、`pages/session/*`、`utils/store.js` | 已实现。离开后草稿可继续或放弃；保留已选词、顺序、模式与已批改结果；放弃不影响历史与错词库 |

## 二、页面与 PRD 第 4 节对照

| PRD 页面 | 原型页面 |
|---|---|
| 家长 · 教材听写页 | `pages/setup/setup` |
| 家长 · 逐词批改页 | `pages/session/session`（手动与自动集中批改共用） |
| 家长 · 批改结果页 | `pages/result/result` |
| 家长 · 错词库 | `pages/bank/bank` |
| 家长 · 听写记录页 | `pages/history/history` |
| 学生 · 今日复习 / 首页 | `pages/home/home` |
| 学生 · 我的错词页 | `pages/bank/bank`（学生视图） |
| 学生 · 自主拼写练习 | `pages/practice/practice` |
| 学生 · 练习记录 | `pages/practice-history/practice-history`、`pages/practice-result/practice-result` |

## 三、PRD 第 5 节流程对照

| 流程 | 实现 |
|---|---|
| 5.1 选词与开始 | 选词页默认预选当前 Unit；开始前校验空选与已有草稿；创建草稿后进入听写页 |
| 5.2 手动听写 | 默认显示答案；逐词播放；标记后自动前进；可回改、跳题；未批改不默认正确 |
| 5.3 自动听写 | 默认隐藏答案；2–15 秒间隔；开始后按序播报；支持暂停 / 跳过 / 提前结束；结束进入集中批改 |
| 5.4 完成、统计与错词处理 | 结果页统计已批改 / 正确 / 错误 / 正确率 / 新增 / 移出；错词按规则迁移；历史只增不改 |
| 5.5 学生自主复习 | 首页展示待复习错词；错词库发起练习；练习记录区分独立 / 提示 / 仍需巩固；不改变错词库 |

## 四、数据对象对照（PRD 第 7 节）

| 对象 | 原型字段 |
|---|---|
| 家庭账号 | `state.role`、`state.children[]`（本地模拟，无登录） |
| 学生档案 | `children[].{id,name,grade,term,version,currentUnit}` |
| 教材词条 | `utils/words.js`：`id/version/grade/term/unit/en/ipa/zh/example/translation` |
| 听写草稿 | `children[].draft`：`items[{wordId,result}]`、`index`、`phase`、`mode`、`language`、`order`、`intervalSec` |
| 听写记录 | `children[].history[]`：`planned/items/stats/mode/language/source/finishedAt` |
| 当前错词 | `children[].wrong{wordId:{count,firstAt,lastAt,practiceCount}}` |
| 自主练习记录 | `children[].practice[]`：`items[{wordId,answer,correct,usedHint}]` |

## 五、暂未实现 / 待确认

1. 真实教材词表、音标 / 释义 / 例句校对、音频资产：当前为演示数据，界面标注「演示词表」。
2. 语音：`utils/audio.js` 为可替换适配层；无音频时进入演示占位，不冒充真实配音。
3. 账号、云端持久化、跨设备同步、数据删除：仅本地 Storage，正式版需云开发或自建后端。
4. 艾宾浩斯间隔复习排程：本轮 PRD 仅要求首页提示待复习错词；首页展示全部当前错词，未做到期计算。
5. 最后一个词的确认方式、自动播放控制、自动模式查看答案、播报语言沿用：均为可替换假设，见 README「待确认假设」。
6. 真机验证：本环境无法运行微信开发者工具；已完成静态检查与页面流程模拟测试，仍需在 iPhone / iPad 微信客户端验证语音、时序与布局。

## 六、测试覆盖

`tests/store.test.js` 覆盖 17 项数据规则：

- 演示数据完整性、词表筛选。
- 草稿创建、去重、顺序、间隔边界。
- 重复标记、未批改保护、部分完成。
- 错词新增 / 累加 / 移出 / 再入。
- 学生练习不移除错词、提示与独立判定。
- 档案上限、重名、档案隔离。
- 草稿冲突与放弃。

`tests/components.test.js` 覆盖 11 项组件行为：

- 顶部栏档案昵称与头像字。
- 角色切换、流程锁定守卫。
- 档案新增的重名校验、上限提示、独立档案写入。
- 原型说明与重置流程。
- 底栏按角色切换条目、跳过当前页。
- 弹窗按钮 / 遮罩 / 输入事件，空状态按钮事件。

`tests/flows.test.js` 覆盖 17 项页面流程：

- 选词页默认预选、切换单元、全选 / 清空。
- 自动听写参数、播放阶段、暂停、提前结束。
- 集中批改、回改、完成保存。
- 结果统计与错词库变更。
- 错词库再次听写、听写历史。
- 学生练习输入、提示、反馈、保存。
- 练习结果分类、首页统计、学生错词库、练习记录、缺失记录空状态。
