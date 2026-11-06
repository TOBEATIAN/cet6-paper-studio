# 2026-10-31 六级智卷生成中断诊断

## 现场

- 安装版本：`0.3.0`
- 可执行文件：`D:\x86\CET-6\六级智卷\cet6-paper-studio.exe`
- 进程：PID `42292`，窗口“六级智卷”，状态 `Responding=True`
- 当前数据目录：`E:\Download\CET-6`
- 当前试卷：`0343719e-c85d-499d-bb82-af28a0b2ec2a`
- 模型：DeepSeek / `deepseek-flash`
- 截图：`docs/evidence/2026-10-31-generation-interruption.png`

## 已确认不是网络或进程崩溃

- 主程序从 14:16 持续运行并正常响应。
- DeepSeek 请求已经推进到 9 个阶段中的第 6 个。
- WebView2 与远端保持连接，模型配置和 API Key 均可用于前 5 个内容阶段。
- 生成断点已实际落盘：
  `E:\Download\CET-6\generation\cet6\0343719e-c85d-499d-bb82-af28a0b2ec2a.json`
  （69,248 字节，最后写入 14:31:51）。

## 断点状态

已保存：

- blueprint
- writing
- listening-a
- listening-b
- listening-c
- reading-a

缺失：

- reading-b
- reading-c
- translation

因此界面 `6/9` 与后台断点完全一致，下一次点击会从 Reading B 重新开始。

## 后台持久化错误

错误记录位于：
`E:\Download\CET-6\chats\0343719e-c85d-499d-bb82-af28a0b2ec2a\f6172dd8-f256-4d5b-9be3-73925b7e5dc1.json`

最近两次失败集中在 Reading B：

1. `reading-b:rewrite-max`
   - 逐条重合上限应 ≤69%
   - 实际为 73%
2. `reading-b:no-straight`
   - 答案段号整体不能单调递增
   - 实际失败
3. `reading-b:opinion`
   - 至少一条观点归属型陈述
   - 实际没有满足
4. `reading-b:quote-attribution`
   - 所有直接引语必须有明确归属
   - 另一次尝试失败

更早一次错误为客观题解析质量门：

- “解析为中文、含英文依据且写明正确字母”

## 诊断结论

当前不是“应用生成到一半崩了”，而是 Reading B 的模型输出连续没有通过确定性质量闸门。
生成器在质检失败后会主动删除 Reading B，阻止不合格内容进入试卷，然后再抛出
`jsonRetryExhausted`。因此界面表现为“生成已中断”，但这是质量闸门在按设计拦截。

同时发现一个独立 UI 问题：`reportGenerationError()` 固定写入
`retryExhausted=false`，而 `errorMessageKey()` 没有 `jsonRetryExhausted` 映射，
所以详情被折叠成“出现了一些问题”，用户看不到上述具体原因。

## 已实施的修复

1. Reading B 拆成两次模型调用：先生成 13 段正文，再生成 10 条匹配陈述。
2. 每套卷从 A-M 中选取 10 个不同段落，保留 3 个干扰段；不强制制造重复段落。
3. 模型先按段落 A-M 的自然顺序写陈述，程序再按“试卷 ID + 标题 + 阅读主题”的固定
   种子重排最终提问顺序。因此每套卷顺序不同，同一套卷重试稳定。
4. Reading B 单独把输出预算提高到至少 16,384 tokens，避免隐藏推理耗尽额度后
   `content` 为空；空响应错误现在会报告 `finish_reason` 和推理字符数。
5. 生成进度卡直接显示失败阶段、具体质量门、错误码和建议动作，并支持一键复制诊断；
   聊天错误记录都会提供“查看问题详情”，不再只显示泛化错误。
6. 当前 `6/9` 断点保留，修复版安装后只重做 Reading B 及之后阶段。

## 真实接口验证

使用当前安装器的 DeepSeek Key 和当前试卷蓝图运行 Reading B 探针：

- 正文第 1 次尝试通过；
- 10 条陈述第 1 次尝试通过；
- 最终答案序列为 `A K I H B L C E G F`，10 个段落互不重复；
- 13 段连续性、1180-1230 词、重合率、引语归属、观点归属、答案顺序均通过。
