# 2026-10-31 六级模拟卷修复与 0.3.4 验证

日期：2026-11-01

试卷：`paperId=eb32c436-372b-40f6-8f54-ad4a9b6ac830`

## 结论

- 修复版已写回原 paperId、工作卷、CET6 断点、试卷库索引和两份 Markdown。
- 最终 57 题，`validateCet6Paper` 为 0 error，`auditCet6Paper` 为 0 error。
- 整卷审计保留 2 条 Project_04 人工回读 warning，逐题检查后均不是双解错误。
- `0.3.4` NSIS 已生成，解包启动和关键载荷哈希通过。

## 局部修复

- 写作：补入 150–220 词、沿用题给开头句的英文参考范文。
- Listening A/B：恢复男女双声、篇幅、材料差异、答案解析字母和原文依据。
- Listening C：重写三篇不同主题材料，校正逐题英文依据，并调整 Q19 选项位。
- Reading B：恢复 13 段 A–M、10 个不同答案段和正文后逐题排版。
- Reading C：仅修 Q47、Q48、Q50 的正确项和解析依据，Reading A 与 Translation
  保留原卷合格内容。

## 关键指标

- Listening A：`395/390` 词。
- Listening B：`315/318` 词。
- Listening C：`485/411/404` 词，合计 `1300` 词。
- Listening 25 题答案：`A6/B6/C6/D7`，无三连相同。
- Reading B：重合率中位 `44.95%`。
- Reading C：两篇段落 σ `27.70/26.07`，长词率 `25.57%/26.79%`。
- Translation：`170` 个汉字。

## 质量问题定位

三节听力分别审计时全部通过，但合并后第一次整卷审计得到
`A6/B6/C5/D8`，违反全卷 `A6/B6/C6/D7` 标准。根因是旧阶段检查只验证
“A–D 都覆盖且无三连”，不能验证跨三节的目标分布，也不能发现总和偏移。

修复方法是不改动 Q19 的四个选项内容，只交换 C/D 两个选项的位置，并同步调整
`correctAnswer` 和解析中的字母引用；随后阶段审计和整卷审计同时通过。

## 审计 warning

`reading-c:same-sentence-warning` 和
`reading-c:dual-support-warning` 是 Project_04 用于人工回读的提示阈值。逐题核对结果如下：

- 干扰项虽然与原文某句共享局部词，但题干关系不成立，或与原文语义相反。
- 正确项没有出现第二个同时成立的选项。
- 因此保留 warning，不为了消除数值提示而人为改写正确内容和解释。

## 安装包验收

- 安装包：`src-tauri\target\release\bundle\nsis\六级智卷_0.3.4_x64-setup.exe`
- 字节数：`168,437,143`
- SHA-256：`6FDCAED94EF7EE1A17E9A1506013969A9AC4C26C82E4163BB13C614E53DFF2B8`
- 解包后的主程序窗口标题为“六级智卷”，进程响应正常。
- Kitten sidecar、ONNX 模型和 voices 与源码资源 SHA-256 完全一致。
- 安装包内包含 KittenML / phonemizer / eSpeak NG 许可和第三方 notice。

## 音频边界

`E:\Download\2026年10月31日六级模拟卷-Listening.mp3` 生成于修复之前，对应旧版
听力文本。它不能作为修复版试卷配套音频；需要按修复版试卷重新合成并人工回听。

## 验证

- 前端：50 个测试文件 / 343 项通过。
- TypeScript：通过。
- 生产前端构建：通过。
- Rust：34 项常规测试通过；4 项慢/联网测试忽略。
- Kitten 中文路径 sidecar 集成：通过。
- 完整音频计划拼接：通过。
- `cargo check`、`cargo fmt --check`：通过。
