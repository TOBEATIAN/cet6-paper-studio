export const CET6_QUICK_PROMPT = `请按固定规格为我设计一套原创、非官方的大学英语六级模拟卷。

硬性规格：
1. Writing：1 篇，给定句开头，150-200 词，106.5 分。
2. Listening Section A：2 篇长对话，共 8 道四选一，题号 1-8，每题 7.1 分。
3. Listening Section B：2 篇听力篇章，共 7 道四选一，题号 9-15，每题 7.1 分。
4. Listening Section C：3 篇讲座/讲话/报道，共 10 道四选一，题号 16-25，每题 14.2 分。
5. Reading Section A：1 篇 260-300 词选词填空，10 题，题号 26-35，每题 3.55 分。
6. Reading Section B：1 篇 1150-1250 词、13 段 A-M 的段落匹配，10 题，题号 36-45，每题 7.1 分。
7. Reading Section C：2 篇各 430-450 词，每篇 5 道四选一，题号 46-55，每题 14.2 分。
8. Translation：1 段 170-190 汉字中译英，106.5 分。
总分 710，考试时间 130 分钟。

输出约束：
- 所有题目和文章全部原创，不得复制真题、外刊原文或现成题库。
- 听力文本必须完整、自然，并放入对应题组的共享 passage；仅试题预览不能看到听力原文。
- 每道选择题恰好 4 个选项，答案必须明确且有简洁解析。
- 使用 examSection.kind 标记 cet-writing、cet-listening-a、cet-listening-b、cet-listening-c、cet-reading-a、cet-reading-b、cet-reading-c、cet-translation。
- 使用 examSection.groupId 绑定共享材料，使用 examSection.questionNumber 写正式题号。
- 写作提供中文写作思路、中文评分标准，以及 150-220 词且沿用给定开头句的英文参考范文；翻译提供参考译文、评分要点和难词提示。
- 开始时先用不超过 12 行确认选题方向和题型完整性，不要直接输出 JSON。等我确认后再生成。`;
