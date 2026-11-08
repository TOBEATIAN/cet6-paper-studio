# 2026-11-08 听力纸面题干与原文泄漏修复

## 旧规则

Project_04 `命题规范.md` §七明确规定：

> 听力只印选项 A–D 与题号（题干由音频朗读）。

因此正常试卷和做题模式中：

- 不显示听力题干；
- 不显示听力原文/transcript；
- 只显示 Conversation/Passage/Recording 分组、题号范围和 A–D 选项；
- 听力题干只存在于答案数据和音频计划中。

答案解析视图可以显示题干和原文，用于复盘。

## 根因

1. `QuestionBlock` 对所有 CET 选择题都无条件渲染 `question.content`，听力题干因此在纸面出现。
2. `PaperCanvas` 对听力 passage 的判断是 `!analysisView || listening`，导致教师普通试卷视图也显示 transscript。
3. 分页高度估算仍把已隐藏的听力题干算进去，隐藏后会留下额外空白。

生成数据本身没有错，音频计划也一直是“朗读题干、不朗读选项”；问题位于渲染和分页层。

## 修复

- 普通纸面和做题模式对 `cet-listening-*` 隐藏 `content`。
- 仅 `answers` 视图显示听力题干。
- 普通纸面隐藏听力 transcript；仅 `answers` 视图显示。
- 分页估算同步跳过普通纸面的听力题干高度。
- 新增组件、Canvas 和分页回归测试，锁住旧规则。

## 验证

- `npm test -- --run`：57 个测试文件 / 391 项通过
- `npm run typecheck`：通过
