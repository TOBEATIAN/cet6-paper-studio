# 六级智卷 0.3.0（2026-10-31）

## 安装包

- 文件：`src-tauri\target\release\bundle\nsis\六级智卷_0.3.0_x64-setup.exe`
- 字节数：`168,451,471`
- SHA-256：
  `08301E0E5D8118128F4131B8B129643DC19724F44155EC35D8C62FDB20837444`
- 平台：Windows x64
- 构建命令：`npm run tauri build -- --bundles nsis`

## 本版内容

- 导出菜单新增完整听力 MP3 生成。
- 阿里云 `qwen3-tts-flash` BYOK、Kitten Nano INT8 本地 sidecar、自定义
  OpenAI 兼容本地 TTS 三种接入。
- 默认 170 wpm，可调 140–200 wpm；固定 13.1 秒作答停顿不参与语速计算。
- 本地规则断句、缩写/日期/时间保护、逐句缓存、失败续跑、静音修剪、保持音高调速
  和纯 Rust MP3 编码。

## 安装器内容核验

NSIS 归档已用 7-Zip 实际读取，并解包到 `target/release/_installer_smoke_20261031_1328`
做启动冒烟。安装器内确认存在：

- `cet6-paper-studio.exe`
- `resources/kitten-tts.exe`
- `resources/kitten-model/config.json`
- `resources/kitten-model/kitten_tts_nano_v0_8.onnx`
- `resources/kitten-model/voices.npz`
- `KITTENML-LICENSE`
- `PHONEMIZER-LICENSE`
- `ESPEAK-NG-GPL-3.0.txt`
- `THIRD_PARTY_NOTICES.md`

解包后的 Release 程序实际启动成功，窗口标题为“六级智卷”，进程响应正常。sidecar、
ONNX 模型和 voices 与源码资源 SHA-256 完全一致。

## 验证

- 前端：45 个测试文件 / 312 项通过
- Rust：30 项常规测试通过，4 项真实接口/慢速集成测试已分别单跑通过
- TypeScript、Rust 格式、Release 编译、NSIS 生成、安装器内容检查和解包启动均通过

## 发布边界

本包可用于内部安装验收。对外分发前仍需完成真实完整 25 题音频质量验收，并随包提供
eSpeak NG / phonemizer 的对应源码获取方式，满足 GPL-3.0 分发义务。
