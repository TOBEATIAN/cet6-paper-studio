# 六级智卷 0.3.1（2026-10-31）

## 安装包

- 文件：`src-tauri\target\release\bundle\nsis\六级智卷_0.3.1_x64-setup.exe`
- 字节数：`168,447,827`
- SHA-256：
  `CB72A032F61CAF01729A2BF4036AB0E9098198C140187DB824E5AD9C94F8673D`
- 平台：Windows x64

## 修复

- Reading B 拆成“13 段正文 → 10 个不同段落按段序写陈述 → 种子重排最终题序”。
- 每套卷从 A-M 中选 10 个不同段落，保留 3 个干扰段；同卷重试顺序稳定，异卷不同。
- Reading B 输出预算提高到至少 16,384 tokens，修复隐藏推理耗尽后 `content` 为空。
- `jsonRetryExhausted / serde / http / io / keychain` 错误都有明确文案。
- 生成进度卡直接显示失败阶段、原因、具体详情和下一步，并可复制诊断信息。
- 历史聊天错误可以展开“查看问题详情”。

## 验证

- 真实 DeepSeek Reading B 探针：正文第 1 次 PASS，陈述第 1 次 PASS。
- 探针最终答案：`A K I H B L C E G F`，为 10 个不同段落。
- 前端：47 个测试文件 / 320 项通过。
- TypeScript、生产构建、Rust 30 项常规测试与 `cargo check` 通过。
- NSIS 归档已核对主程序、Kitten sidecar、ONNX 模型、voices 和许可文件。
- 解包后的 Release 程序实际启动成功，sidecar/模型/voices 哈希与源码资源一致。

## 兼容

- 旧数据目录和 `6/9` 断点保留。
- 安装后再次点击“生成六级整卷”，会从 Reading B 继续，不会重做前六个阶段。
