# 六级智卷 0.3.5（Windows x64）

日期：2026-11-01

状态：Windows x64 NSIS 已构建，完成载荷哈希、解包启动和软件内卷面验收。

## 安装包

- 路径：`src-tauri\target\release\bundle\nsis\六级智卷_0.3.5_x64-setup.exe`
- 字节数：`168,423,934`
- SHA-256：`0EA0EE4BCA3F8EC396592201AE1F798AAC8E4816865C3D8D970F995C37CAC5F8`

## 本轮修复

- 写作给定句强制使用全角中文双引号 `“…”`，模型返回 ASCII 引号时自动规范化。
- Writing 标题恢复旧卷格式 `Part I　Writing　(30 minutes)`，不显示题号。
- Directions 恢复旧卷固定模板，给定句以全角 `“…”` 内嵌在
  `begins with the sentence …` 中，不添加 `Opening sentence:` 标签。
- 新增 `writing:given-quotes` 与 `writing:prompt-template` 两个质量硬闸门。
- 复盘改为 Project_04 四层旧流程：事实、逐项归因、跨套模式、带阈值的肯定动作。
- 写作/翻译按官方五档总体印象法定档、定档内分；升级稿基于学生原文并单独评分。
- 阅读 C 保持“先自己拆，再让 AI 核对”，并生成 D+1/3/7/16/35 复扫日历。
- 应用启动数据目录恢复为 `E:\Download\CET-6`，不再误读
  `Documents\AI试卷` 下的 0 题空白卷。
- 顶部新增常驻“听力”按钮，可直接打开当前语音引擎、140-200 wpm 语速和
  “生成听力 MP3”，不再需要从导出菜单里寻找。
- 听力面板自动加载当前试卷已生成的 MP3，并提供播放/暂停、后退 15 秒、
  前进 15 秒、可拖动进度条和当前/总时长显示。

## 听力能力

- 安装包内置 Kitten sidecar、ONNX 模型、voices 和许可文件。
- 可从导出菜单生成完整听力 MP3，包含材料、7 条题组播报和 25 段作答停顿。
- 生成结果可在应用内直接播放。
- 如需完全离线，在“听力语音与语速”中切换到 Kitten 本地。
- 现有旧 `Listening.mp3` 对应修复前文本，不能作为新版配套音频。
- 已用小米 MiMo Chloe + Milo 按 170 wpm 重新生成当前卷：
  `papers\2026年10月31日六级模拟卷-eb32c436-Listening.mp3`；
  25:07.0、12,056,832 字节、25 段回答停顿、7 条题组播报，实测 169.64 wpm。

## 验证

- 前端：51 个测试文件 / 350 项通过。
- TypeScript、生产构建、`cargo check`、`cargo fmt --check` 通过。
- Rust：34 项常规测试通过；Kitten 中文路径与完整音频计划集成通过。
- 解包后主程序实际启动，窗口标题“六级智卷”，软件内 Writing 版式与旧版
  2026-10-27 成品一致，给定句全角引号清晰可见。
- Kitten sidecar、ONNX 模型和 voices 与源码资源 SHA-256 一致。
