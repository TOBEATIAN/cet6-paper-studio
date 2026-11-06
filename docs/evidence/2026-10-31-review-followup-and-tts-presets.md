# 2026-10-31 评审问题修复与 TTS 供应商扩展

## 成熟流程是唯一评判标准

本轮不再另造一套“接近旧标准”的规则，直接对账：

- `E:\WorkSpace\Project_04_专门学习\Project_02_六级\模拟卷\操作手册.md`
- `E:\WorkSpace\Project_04_专门学习\Project_02_六级\模拟卷\命题规范.md`
- `E:\WorkSpace\Project_04_专门学习\Project_02_六级\模拟卷\scripts\band_auto.json`
- `E:\WorkSpace\Project_04_专门学习\Project_02_六级\模拟卷\scripts\qa_check.js`
- `E:\WorkSpace\Project_04_专门学习\Project_02_六级\模拟卷\scripts\lib\{text,support,specifics,quotes}.js`

已修正的真实口径漂移：

- 旧实词定义是“长度 >3 且不在旧停用词表内”，应用曾误写为“>2”。
- 停止词表和支撑句切分必须与旧 `lib/text.js` / `lib/support.js` 一致；同名指标不能在两套工具里得到不同百分比。
- 阅读 B 采用旧 `band_auto.json` 的 40%–45% 带内口径，并保留逐条 ≤69% 的 P90 上限。
- 听力篇幅直接使用旧流程的 A 360–400、B 310–365、C 400–500/合计 1300–1450，不再额外增加一套更窄的总词数门槛。
- 写作参考范文、阅读 C 支撑句、连续照搬、干扰项、翻译长度等继续使用旧规则。

## 评审材料处理

评价材料：
`E:\Download\2026年10月31日六级模拟卷-评审与修改清单.md`

本轮直接处理的可复现问题：

- 听力正确选项改为生成前固定；解析正文中的 `X 项正确`、`故选 X` 与最终答案键
  三方核对。
- 听力长词、选项词数、阅读 B 重合中位、阅读 C 支撑句重合改为双向区间检查。
- 七个听力材料增加独立 blueprint 案例、同机构/同服务/同规则限制和跨组实词重合上限。
- Reading B 正文固定 13 段 A–M，最终选择 10 个不同段落，保留 3 个干扰段；选项库
  由实际段落动态生成。
- 写作禁止 `whether` 框架，答案稿增加 150–220 词英文范文并要求沿用给定开头句。
- 听力英文依据必须能在对应材料中定位，并与正确选项至少共享两个实词。
- 音频计划增加标题后、轮次间和句间停顿，过滤 `Host:` / `Guest:` 等场记标签，
  题组播报改为完整区间表达。

## 用户界面验收

使用 2026-10-31 的真实 `working-paper.json` 在浏览器中加载真实 React 页面，并切换到
学生版：

- Reading B 段落：13 段，标识为 A–M。
- 最后一个 M 段和 36 题在同一页。
- 36 题紧接正文后的陈述题区域，不再出现正文后大块空白再去下一页排题。
- 抽样题干、选项、段落共 60 个文本节点，计算样式均为 `rgb(0, 0, 0)`。
- 截图：`docs/evidence/2026-10-31-reading-b-student-page.png`。

## 小米 MiMo

官方文档确认 MiMo-V2.5-TTS 有三种模型：

- `mimo-v2.5-tts`：预置音色；
- `mimo-v2.5-tts-voicedesign`：文字设计音色；
- `mimo-v2.5-tts-voiceclone`：参考音频复刻音色。

本轮自动整卷只接预置音色版。另外两种不是同一套“传文本即可”的参数，分别需要音色
描述或参考音频，因此不能伪装成同一字段直接开放。官方接口：

- Base URL：`https://api.xiaomimimo.com/v1`
- Endpoint：`/chat/completions`
- 文本角色：`assistant`
- 音频格式：`wav`
- 官方计费：当前限时免费，活动结束后未知

来源：
https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5

## 更便宜的在线方案

新增硅基流动预设：

- Base URL：`https://api.siliconflow.cn/v1`
- 默认模型：`FunAudioLLM/CosyVoice2-0.5B`
- 官方价格页当前约 ¥0.05/千字符，即约 ¥0.50/万字符。
- 对比阿里云当前约 ¥0.80/万字符。

由于它的音色 ID 和模型版本可能调整，界面保留模型、男女音色字段为可编辑状态；
首次真实生成前应使用实际 Key 做一次连接测试。

## Kitten 根因

Kitten sidecar 和模型本身没有损坏。真正问题是设置页“测试连接”沿用了自定义本地
端点的参数，导致它收到错误音色、模型和 URL。现在测试连接会使用：

- model：`kitten-tts-nano-0.8-int8`
- voice：`Rosie`
- base URL / API Key：空

实际验证：

- 中文路径下随包 sidecar 合成测试通过，耗时约 7.5 秒。
- 完整听力计划的分句缓存、组装、MP3 编码测试通过，耗时约 15 秒。
- Rust 常规测试 34 项通过；前端 50 个测试文件 / 343 项通过；TypeScript 与
  `cargo fmt --check` 通过。

