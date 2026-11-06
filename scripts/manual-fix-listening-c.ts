import fs from "node:fs";
import { auditCet6Stage } from "../src/lib/cet/quality/audit";
import type { Question } from "../src/lib/types/exam";

const outputPath = "E:\\Download\\CET-6\\.repair-eb32c436\\listening-c.json";

const transcriptOne = `Good morning. Today I want to explain how two simple changes can cool a city street. The Riverton heat pilot began after summer sensors showed that the market square was often six degrees warmer than a nearby park. The square had dark paving, few trees, and almost no shade. These conditions made the area uncomfortable for older residents, food sellers, and children who used it after school. The city could not rebuild the whole square, so planners tested a smaller plan. First, they planted twenty-four young trees along the sunny side. Second, they replaced part of the concrete with permeable blocks that let rainwater pass into the ground. The blocks were not a complete solution because they became less effective when dust filled their small openings. Weekly cleaning was therefore added to the maintenance plan. The young trees also needed water for at least two summers before their roots could support steady growth. During the trial, volunteers measured surface temperature at noon and interviewed people who used the square. After twelve weeks, shaded seats were about three degrees cooler, and more people stayed after shopping. However, temperatures near the bare southern entrance hardly changed. Dr. Maya Chen, an urban climate researcher, said, "Small cooling steps work best when they are joined together and placed where people actually wait." The team then added two shade sails near the bus stop and moved several benches under the trees. The project did not aim to remove every hot spot. Its purpose was to show which low-cost changes could make daily public activity easier while wider street upgrades were planned. The city will compare repair costs, shade coverage, and visitor comfort for another year before expanding the scheme.`;
const expandedTranscriptOne = transcriptOne
  .replace(
    "During the trial, volunteers measured surface temperature at noon and interviewed people who used the square.",
    "During the trial, volunteers measured surface temperature at noon and interviewed people who used the square. Some days were too hot for interviews, so the survey ran early in the morning and again after four o'clock.",
  )
  .replace(
    "The project did not aim to remove every hot spot.",
    "The city also learned that shade must be planned with walking routes, not placed only in open display areas. A seat may be cool but useless if people must cross direct sun to reach it. Sellers asked for wider covers that would protect both customers and food, while residents wanted safe places to rest while carrying bags. These requests changed the final layout. The project did not aim to remove every hot spot.",
  )
  .replace(
    "The young trees also needed water for at least two summers before their roots could support steady growth.",
    "The young trees also needed water for at least two summers before their roots could support steady growth. Shop owners initially worried that digging would block deliveries and reduce sales. To address this concern, workers completed one short section at a time and kept temporary walkways open. The team also published a weekly map showing which entrances remained accessible. That practical arrangement reduced complaints and allowed the trial to continue during the busiest trading season. Clear signs explained each stage of construction, and businesses received advance notice whenever an entrance would close. Residents could also meet the planners on Thursday afternoons, inspect samples of the new paving, ask detailed questions about long-term care, and propose alternative positions for benches, enabling practical concerns to shape the final design and giving local people confidence that maintenance would continue.",
  );

const transcriptTwo = `Public radio stations hold thousands of old tapes that have never been heard online. Many boxes contain local interviews, music concerts, and news reports from the past fifty years. The Westbridge station recently began an archive rescue project after staff found water damage in a basement storeroom. The goal is not to collect every tape ever recorded. Instead, the team selects material with clear public value, including voices that are missing from national collections. Restoring a tape is slower than many people expect. Old plastic can become sticky, so a machine may stop during playback and damage the tape. Technicians first inspect the surface, clean it with a special machine, and copy the sound in real time. One hour of tape therefore needs one full hour of transfer, plus time for checks. Rights add another problem. A recording may feature musicians, interviewees, or writers whose permission must be confirmed before online release. The station also has to write useful labels. A file named "interview 1987" is difficult to find, while a list of names, places, and subjects allows researchers to use the sound. The archive director, Samuel Reed, said, "A recording has little public value if nobody can discover or understand it." Volunteers are trained to listen for gaps, repeat material, and private information that should not be published. The station does not promise to restore its whole basement. It releases small themed collections and explains which items remain unavailable and why. This open process has attracted donations and new volunteers. The project shows that saving sound requires more than a working player. It joins technical care, legal checks, and clear description so later listeners can trust what they hear.`;
const expandedTranscriptTwo = transcriptTwo
  .replace(
    "One hour of tape therefore needs one full hour of transfer, plus time for checks.",
    "One hour of tape therefore needs one full hour of transfer, plus time for checks. Some tapes also carry mold from damp storage. Staff must dry and clean them in a separate room before they touch a player. If the original breaks, the team keeps both the damaged copy and the new digital file, because later equipment may recover more sound.",
  )
  .replace(
    "The station also has to write useful labels.",
    "Rights work can delay a project for months, and some recordings may never be released. Agreements are stored beside each digital file so later staff can identify the permitted uses. The station also has to write useful labels.",
  )
  .replace(
    "Volunteers are trained to listen for gaps, repeat material, and private information that should not be published.",
    "Volunteers are trained to listen for gaps, repeat material, and private information that should not be published. They also record the quality of each copy and note which machine produced it.",
  )
  .replace(
    "It releases small themed collections and explains which items remain unavailable and why.",
    "It releases small themed collections and explains which items remain unavailable and why. Before publication, another volunteer checks every file against the written description. This second review catches misspelled names, incorrect dates, and sections that begin without enough context. Listeners can also report mistakes through a simple form, and corrections appear beside the original entry.",
  );

const transcriptThree = `A museum label can seem simple to a visitor, but it can exclude people who cannot see the object clearly. The Northfield History Museum is redesigning its labels for visitors with low vision. The team began by watching how ten visitors moved through the gallery. Many could not read small letters from a normal standing distance. Others missed information placed below a display or printed on a dark surface. The museum first enlarged the main text, strengthened the contrast, and added short spoken descriptions. It then produced tactile maps that show the shape and position of key objects. These changes helped, but testing revealed another problem: too much text made the labels slower to understand, while very simple words sometimes removed the reason an object mattered. The team therefore used a two-level style. A large label gives the object name, date, and one clear point. A second label provides details and asks visitors whether more assistance would help. Curator Alice Morgan said, "Accessibility is not a separate version placed at the back of the building; it is part of how everyone understands the collection." Staff also added audio stops with the same numbers as the labels, so listeners can follow the gallery in one order. The project costs more than expected because every new display needs user testing and maintenance. Volunteers check that touch surfaces remain clean and buttons still work. The museum does not claim that one design fits every visitor. It plans to review feedback each season and keep several ways of taking in the same story. The aim is not to make the building look modern, but to let more people take part with confidence and without asking for constant help.`;
const expandedTranscriptThree = transcriptThree
  .replace(
    "Others missed information placed below a display or printed on a dark surface.",
    "Others missed information placed below a display or printed on a dark surface. Some visitors could see an object outline but could not judge its material or moving parts.",
  )
  .replace(
    "It then produced tactile maps that show the shape and position of key objects.",
    "It then produced tactile maps that show the shape and position of key objects. Small models let visitors feel how a lid opens or how a tool fits into a hand.",
  )
  .replace(
    "Staff also added audio stops with the same numbers as the labels, so listeners can follow the gallery in one order.",
    "Staff also added audio stops with the same numbers as the labels, so listeners can follow the gallery in one order. Seats were placed near the longer audio stops, and routes were kept wide enough for guide dogs and wheelchairs. Each stop can be paused or repeated, and the voice does not rush through a long explanation. The museum consulted guide-dog users about floor textures and asked people with limited hand movement whether the controls were easy to reach. It also trained front-desk workers to offer help without assuming that a visitor needs it. A small reference group will advise future purchases, while staff will record recurring questions.",
  );

function makeQuestions(
  groupId: string,
  title: string,
  transcript: string,
  definitions: Array<{
    number: number;
    stem: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }>,
): Question[] {
  return definitions.map((definition, index) => ({
    id: `${groupId}-${index + 1}`,
    type: "single-choice",
    content: definition.stem,
    options: definition.options,
    correctAnswer: definition.correctAnswer,
    explanation: definition.explanation,
    score: 14.2,
    examSection: {
      kind: "cet-listening-c",
      groupId,
      title,
      questionNumber: definition.number,
      ...(index === 0 ? { passage: transcript, hidePassageForStudent: true } : {}),
    },
  }));
}

const questions = [
  ...makeQuestions(
    "recording-1",
    "Listening Section C · Recording 1",
    expandedTranscriptOne,
    [
      {
        number: 16,
        stem: "What was the main purpose of the Riverton heat pilot program?",
        options: [
          "To replace every paved street with natural parkland",
          "To compare national policies for cooling public squares",
          "To test low-cost changes that make daily activity easier",
          "To measure how quickly young trees can produce fruit",
        ],
        correctAnswer: 2,
        explanation:
          "原文说项目要验证“which low-cost changes could make daily public activity easier”，emphasis 落在用可负担改造改善街道舒适度，故 C 项正确。A) 错误类型：程度偏移。项目只替换 part of the concrete，并未翻新所有街道。B) 错误类型：张冠李戴。项目比较的是本地改造效果，不是国家政策。D) 错误类型：无中生有。树木结果不在研究目标内。故选 C。",
      },
      {
        number: 17,
        stem: "Why did the team add shade sails beside the busy bus stop?",
        options: [
          "The stops had already become wider than nearby parks",
          "The change placed cooling where people actually waited",
          "The sails were less expensive than cleaning paving blocks",
          "The southern entrance needed a new public transport route",
        ],
        correctAnswer: 1,
        explanation:
          "研究员强调“Small cooling steps work best when they are joined together and placed where people actually wait”，团队因此把遮阳帆放到公交站，故 B 项正确。A) 错误类型：与原文相悖。原文说公交站附近炎热，不是车站宽于公园。C) 错误类型：无中生有。费用比较没有用于解释遮阳帆的位置。D) 错误类型：张冠李戴。南入口的问题与新增公交路线不是同一项措施。故选 B。",
      },
      {
        number: 18,
        stem: "What limitation of the permeable paving did the project identify?",
        options: [
          "Dust blocked openings that let rainwater pass through",
          "It made the market square hotter than bare concrete",
          "It could not support the weight of food sellers",
          "It required replacement after every summer season",
        ],
        correctAnswer: 0,
        explanation:
          "原文指出透水砖“became less effective when dust filled their small openings”，因此需要每周清洁，故 A 项正确。B) 错误类型：与原文相悖。该措施用于降温，并非使地面更热。C) 错误类型：无中生有。承载摊贩重量没有作为限制出现。D) 错误类型：程度偏移。维护包括清洁，不是每个夏季全部更换。故选 A。",
      },
    ],
  ),
  ...makeQuestions(
    "recording-2",
    "Listening Section C · Recording 2",
    expandedTranscriptTwo,
    [
      {
        number: 19,
        stem: "Why did the Westbridge radio station begin its archive rescue project?",
        options: [
          "It wanted to sell historical recordings to private collectors",
          "It planned to replace all national sound collections quickly",
          "It found water damage affecting valuable local recordings",
          "It needed additional storage for newly recorded interviews",
        ],
        correctAnswer: 2,
        explanation:
          "原文说工作人员“found water damage in a basement storeroom”后启动抢救项目，故 C 项正确。A) 错误类型：与原文相悖。项目目标是 public value，不是出售藏品。B) 错误类型：程度偏移。电台补充本地缺口，不取代国家收藏。D) 错误类型：张冠李戴。水损发生在旧档案储藏室，不是新采访需要空间。故选 C。",
      },
      {
        number: 20,
        stem: "Why can transferring an old sticky tape take an especially long time?",
        options: [
          "Volunteers must translate every interview into another language",
          "Old plastic can stick and stop the tape during playback",
          "Each recording must be broadcast before it can be copied",
          "The station refuses to use any modern transfer equipment",
        ],
        correctAnswer: 1,
        explanation:
          "原文说明旧塑料会“become sticky, so a machine may stop during playback”，技术人员必须慢速检查并实时复制，故 B 项正确。A) 错误类型：无中生有。翻译没有作为转移步骤。C) 错误类型：张冠李戴。在线发布发生在修复之后，不是复制前提。D) 错误类型：与原文相悖。团队使用 special machine 完成清洁和复制。故选 B。",
      },
      {
        number: 21,
        stem: "What does the archive director suggest makes a restored recording useful to the public?",
        options: [
          "Keeping the original tape hidden from all researchers",
          "Publishing every recording without asking for permission",
          "Giving the file a simple title such as interview 1987",
          "Adding useful labels so people discover each recording",
        ],
        correctAnswer: 3,
        explanation:
          "Reed 说“A recording has little public value if nobody can discover or understand it”，并强调 names, places, subjects 等有用标签，故 D 项正确。A) 错误类型：与原文相悖。项目目标就是提供访问。B) 错误类型：与原文相悖。节目要先确认 rights。C) 错误类型：与原文相悖。过于简单的文件名被明确说难以查找。故选 D。",
      },
    ],
  ),
  ...makeQuestions(
    "recording-3",
    "Listening Section C · Recording 3",
    expandedTranscriptThree,
    [
      {
        number: 22,
        stem: "What is the Northfield museum trying to achieve through its label redesign?",
        options: [
          "To reduce the number of historical objects on display",
          "To make every visitor follow exactly the same route",
          "To replace spoken descriptions with longer printed text",
          "To let more visitors take part with confidence",
        ],
        correctAnswer: 3,
        explanation:
          "原文说目标是“let more people take part with confidence and without asking for constant help”，故 D 项正确。A) 错误类型：无中生有。项目没有减少展品。B) 错误类型：程度偏移。统一编号帮助跟随音频，不是强制所有路线完全相同。C) 错误类型：与原文相悖。博物馆增加了 spoken descriptions，而不是用长文字取代它们。故选 D。",
      },
      {
        number: 23,
        stem: "What design problem emerged during the museum’s early label testing?",
        options: [
          "The main text was too large for the display boards",
          "Touch surfaces could not show the shape of objects",
          "Long text slowed reading while short text lost meaning",
          "Audio buttons worked only for visitors with perfect sight",
        ],
        correctAnswer: 2,
        explanation:
          "原文指出“too much text made the labels slower to understand, while very simple words sometimes removed the reason an object mattered”，故 C 项正确。A) 错误类型：无中生有。字号过大没有成为问题。B) 错误类型：与原文相悖。tactile maps 已用于表现形状。D) 错误类型：无中生有。按钮并非只为视力正常者工作。故选 C。",
      },
      {
        number: 24,
        stem: "What solution did the museum adopt after testing different label styles?",
        options: [
          "A two-level label style with a large overview and details",
          "One short label with no dates or historical context",
          "A separate accessibility room placed behind the gallery",
          "A printed guide available only from museum employees",
        ],
        correctAnswer: 0,
        explanation:
          "原文说团队采用“a two-level style”，第一层给 object name, date, one clear point，第二层提供 details，故 A 项正确。B) 错误类型：与原文相悖。只保留极简文字会丢掉意义，正是团队要避免的做法。C) 错误类型：与原文相悖。Morgan 明确反对把 accessibility 放在 building 后面。D) 错误类型：无中生有。帮助信息不是仅由员工口头提供。故选 A。",
      },
      {
        number: 25,
        stem: "What is the speaker’s overall attitude toward the museum’s accessibility project?",
        options: [
          "It has made every future exhibition equally accessible.",
          "It invested too much money without gaining useful feedback.",
          "It should stop testing and copy one standard design everywhere.",
          "It merits review each season and ongoing upkeep.",
        ],
        correctAnswer: 3,
        explanation:
          "原文承认项目 cost more than expected，同时说将“review feedback each season”并维护 touch surfaces 和 buttons，说明态度是认可但持续改进，故 D 项正确。A) 错误类型：程度偏移。博物馆不声称 one design fits every visitor。B) 错误类型：无中生有。反馈推动了 design，不是毫无收获。C) 错误类型：与原文相悖。团队坚持多种理解方式和持续测试。故选 D。",
      },
    ],
  ),
];

const report = auditCet6Stage("listening-c", questions);
if (!report.passed) {
  console.error(JSON.stringify(report.errors, null, 2));
  process.exit(1);
}
const temporary = `${outputPath}.tmp`;
fs.writeFileSync(temporary, JSON.stringify(questions, null, 2), "utf8");
fs.renameSync(temporary, outputPath);
console.log(`[manual] listening-c saved: ${questions.length}`);
