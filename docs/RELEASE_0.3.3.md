# 六级智卷 0.3.3（2026-10-31）

## 安装包

- 文件：`src-tauri\target\release\bundle\nsis\六级智卷_0.3.3_x64-setup.exe`
- 字节数：`168,444,089`
- SHA-256：
  `4B74EBCC8F6E553E4AFCADF658D0487DC62E8E424F37030B723C803A3A18B79C`
- 平台：Windows x64

## 听力 C 修复

- 解析校验现在逐题指出是缺中文、缺英文原文引述、缺“故选 X”，还是
  “故选 X”与 `correctAnswer` 不一致。
- 听力提示新增同样的硬性要求，避免模型只知道笼统的“解析要完整”。
- 听力阶段自动定向修复次数由 3 次提高到 5 次。

## 自动自愈

- 后续尝试会把上一版完整 JSON 和具体失败项一起回传给模型。
- 模型只修改不合格部分，保留已经通过的正文、题目、选项和解析。
- 覆盖蓝图、写作、听力 A/B/C、阅读 A/B/C 和翻译。
- 自愈仍失败时才进入最终错误状态。

## 可查询诊断

- 每个失败尝试保存到：
  `generation/cet6/diagnostics/{paperId}/`
- 文件包含阶段、尝试次数、耗时、provider/model、校验错误、完整请求消息和模型原始回复。
- API Key 和 Authorization 请求头不会写入。
- 错误卡直接显示诊断目录，并提供“打开诊断目录”。

## 验证

- 真实 DeepSeek 听力 C 在修复后首轮通过。
- 前端：50 个测试文件 / 333 项通过。
- TypeScript、Rust 32 项常规测试、`cargo fmt --check`、`cargo check` 通过。
- NSIS 包含主程序、Kitten sidecar、ONNX 模型、voices 和许可文件。
- 解包主程序实际启动，窗口“六级智卷”响应正常。

## 升级边界

- 当前安装包尚未做 Windows 代码签名，首次运行可能触发 SmartScreen 提示。
- 安装包不包含 API Key，也不会删除用户数据目录、试卷库或生成断点。
