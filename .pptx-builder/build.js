const PptxGenJS = require("pptxgenjs");

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "CUSTOM", width: 13.33, height: 7.5 });
pptx.layout = "CUSTOM";

// Color palette - China red theme
const RED = "990011";
const DARK = "1A1A2E";
const WHITE = "FFFFFF";
const OFFWHITE = "FCF6F5";
const GOLD = "D4A017";
const GRAY = "6B7280";
const LIGHTGRAY = "F3F4F6";
const DARKTEXT = "1F2937";

// Font setup
const TITLE_FONT = "Arial Black";
const BODY_FONT = "Calibri";

// Helper: add dark slide background
function darkBg(slide) {
  slide.background = { fill: DARK };
}

// Helper: add light slide background
function lightBg(slide) {
  slide.background = { fill: OFFWHITE };
}

// Helper: white section title on dark bg
function darkTitle(slide, text, y = 0.5) {
  slide.addText(text, {
    x: 0.8,
    y,
    w: 11.7,
    h: 0.7,
    fontSize: 32,
    fontFace: TITLE_FONT,
    color: WHITE,
    bold: true,
  });
}

// Helper: dark section title on light bg
function lightTitle(slide, text, y = 0.4) {
  slide.addText(text, {
    x: 0.8,
    y,
    w: 11.7,
    h: 0.7,
    fontSize: 32,
    fontFace: TITLE_FONT,
    color: DARK,
    bold: true,
  });
}

// Helper: subtitle
function addSubtitle(slide, text, y = 1.4) {
  slide.addText(text, {
    x: 0.8,
    y,
    w: 11.7,
    h: 0.5,
    fontSize: 16,
    fontFace: BODY_FONT,
    color: GRAY,
  });
}

// Helper: big stat callout
function statCallout(slide, x, y, number, label, color = RED) {
  slide.addText(number, {
    x,
    y,
    w: 2.5,
    h: 0.9,
    fontSize: 44,
    fontFace: TITLE_FONT,
    color,
    bold: true,
    align: "center",
  });
  slide.addText(label, {
    x,
    y: y + 0.8,
    w: 2.5,
    h: 0.4,
    fontSize: 12,
    fontFace: BODY_FONT,
    color: GRAY,
    align: "center",
  });
}

// Helper: body text
function bodyText(slide, texts, x, y, w, h, opts = {}) {
  slide.addText(texts, {
    x,
    y,
    w,
    h,
    fontSize: 14,
    fontFace: BODY_FONT,
    color: DARKTEXT,
    lineSpacingMultiple: 1.5,
    bullet: opts.bullet !== false,
    ...opts,
  });
}

// ==================== SLIDE 1: COVER ====================
const s1 = pptx.addSlide();
darkBg(s1);

// Decorative red bar at top
s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: RED } });

// Gold accent line
s1.addShape(pptx.ShapeType.rect, { x: 0.8, y: 2.2, w: 1.5, h: 0.05, fill: { color: GOLD } });

s1.addText("2026 汤姆斯杯 & 尤伯杯", {
  x: 0.8,
  y: 2.5,
  w: 11.7,
  h: 1.2,
  fontSize: 36,
  fontFace: TITLE_FONT,
  color: WHITE,
  bold: true,
});

s1.addText("中国羽毛球队成绩报告", {
  x: 0.8,
  y: 3.7,
  w: 11.7,
  h: 0.8,
  fontSize: 22,
  fontFace: BODY_FONT,
  color: GOLD,
});

s1.addText("丹麦 · 霍森斯  |  2026年5月9日", {
  x: 0.8,
  y: 5.5,
  w: 11.7,
  h: 0.5,
  fontSize: 14,
  fontFace: BODY_FONT,
  color: GRAY,
});

// Large "12" watermark
s1.addText("12", {
  x: 9,
  y: 1,
  w: 4,
  h: 5,
  fontSize: 180,
  fontFace: TITLE_FONT,
  color: "2A2A3E",
  bold: true,
  align: "right",
  valign: "middle",
});

// ==================== SLIDE 2: SUMMARY ====================
const s2 = pptx.addSlide();
darkBg(s2);
darkTitle(s2, "赛事总览");

// Three stat callouts
statCallout(s2, 0.8, 1.8, "一冠一亚", "最终成绩", GOLD);
statCallout(s2, 4.2, 1.8, "第12冠", "汤杯队史纪录", RED);
statCallout(s2, 7.6, 1.8, "3:1", "决赛击败法国", WHITE);

// Bottom summary
s2.addShape(pptx.ShapeType.rect, {
  x: 0.8,
  y: 3.8,
  w: 11.7,
  h: 2.5,
  fill: { color: "2A2A3E" },
  rectRadius: 0.1,
});

const summaryItems = [
  { label: "🏆 汤姆斯杯", value: "中国 3:1 法国 — 成功卫冕" },
  { label: "🥈 尤伯杯", value: "韩国 3:1 中国 — 摘得银牌" },
  { label: "📌 时代意义", value: '"21分制"时代最后一届汤尤杯' },
  { label: "🌍 格局变化", value: "欧洲势力崛起，印尼无缘八强" },
];

summaryItems.forEach((item, i) => {
  s2.addText(item.label, {
    x: 1.2,
    y: 4.0 + i * 0.55,
    w: 2.5,
    h: 0.5,
    fontSize: 13,
    fontFace: BODY_FONT,
    color: GOLD,
    bold: true,
  });
  s2.addText(item.value, {
    x: 3.7,
    y: 4.0 + i * 0.55,
    w: 8,
    h: 0.5,
    fontSize: 13,
    fontFace: BODY_FONT,
    color: WHITE,
  });
});

// ==================== SLIDE 3: TANG CUP FINAL ====================
const s3 = pptx.addSlide();
lightBg(s3);
lightTitle(s3, "汤姆斯杯决赛：中国 3:1 法国");
addSubtitle(s3, "卫冕成功，夺取队史第12冠");

// Match table
const headers = [["场次", "中国选手", "对手", "比分", "结果"]];
const rows = [
  ["一单", "石宇奇", "—", "21:17（决胜局）", "✅ 胜"],
  ["二单", "李诗沣", "拉尼尔", "0:2", "❌ 负"],
  ["三单", "翁泓阳", "大波波夫", "22:20 / 20:22 / 21:19", "✅ 胜"],
  ["二双", "任翔宇/何济霆", "—", "—", "✅ 锁定制胜分"],
];

s3.addTable([...headers, ...rows], {
  x: 0.8,
  y: 2.2,
  w: 11.7,
  colW: [1.0, 2.8, 2.2, 3.5, 2.2],
  fontSize: 13,
  fontFace: BODY_FONT,
  border: { type: "solid", pt: 0.5, color: "E5E7EB" },
  rowH: [0.45, 0.45, 0.45, 0.45, 0.45],
  fill: { color: WHITE },
  color: DARKTEXT,
  autoPage: false,
});

// Header row styling - done via first row
s3.addShape(pptx.ShapeType.rect, { x: 0.8, y: 2.2, w: 11.7, h: 0.45, fill: { color: RED } });
s3.addText("场次", {
  x: 0.8,
  y: 2.2,
  w: 1.0,
  h: 0.45,
  fontSize: 12,
  fontFace: TITLE_FONT,
  color: WHITE,
  align: "center",
  valign: "middle",
});
s3.addText("中国选手", {
  x: 1.8,
  y: 2.2,
  w: 2.8,
  h: 0.45,
  fontSize: 12,
  fontFace: TITLE_FONT,
  color: WHITE,
  align: "center",
  valign: "middle",
});
s3.addText("对手", {
  x: 4.6,
  y: 2.2,
  w: 2.2,
  h: 0.45,
  fontSize: 12,
  fontFace: TITLE_FONT,
  color: WHITE,
  align: "center",
  valign: "middle",
});
s3.addText("比分", {
  x: 6.8,
  y: 2.2,
  w: 3.5,
  h: 0.45,
  fontSize: 12,
  fontFace: TITLE_FONT,
  color: WHITE,
  align: "center",
  valign: "middle",
});
s3.addText("结果", {
  x: 10.3,
  y: 2.2,
  w: 2.2,
  h: 0.45,
  fontSize: 12,
  fontFace: TITLE_FONT,
  color: WHITE,
  align: "center",
  valign: "middle",
});

// Key highlight
s3.addShape(pptx.ShapeType.rect, {
  x: 0.8,
  y: 4.7,
  w: 11.7,
  h: 1.8,
  fill: { color: LIGHTGRAY },
  rectRadius: 0.08,
});

s3.addText("🔑 决赛关键进程", {
  x: 1.1,
  y: 4.8,
  w: 5,
  h: 0.4,
  fontSize: 14,
  fontFace: TITLE_FONT,
  color: RED,
  bold: true,
});

s3.addText(
  [
    { text: "石宇奇胜 → 李诗沣负 → 1:1 平 → ", options: { fontSize: 12 } },
    { text: "翁泓阳 96分钟鏖战胜", options: { fontSize: 12, bold: true, color: RED } },
    { text: " → 2:1 领先 → 任翔宇/何济霆锁定冠军 → ", options: { fontSize: 12 } },
    { text: "3:1 ！", options: { fontSize: 14, bold: true, color: RED } },
  ],
  {
    x: 1.1,
    y: 5.3,
    w: 11,
    h: 0.8,
    fontFace: BODY_FONT,
    color: DARKTEXT,
    lineSpacingMultiple: 1.4,
  },
);

// ==================== SLIDE 4: TANG CUP ROAD ====================
const s4 = pptx.addSlide();
lightBg(s4);
lightTitle(s4, "汤姆斯杯：夺冠之路");
addSubtitle(s4, "从小组赛到决赛的征途");

// Roadmap - Group Stage
s4.addShape(pptx.ShapeType.rect, {
  x: 0.8,
  y: 2.0,
  w: 5.5,
  h: 2.8,
  fill: { color: WHITE },
  shadow: { type: "outer", blur: 6, offset: 3, color: "D0D0D0", opacity: 0.3 },
  rectRadius: 0.1,
});

s4.addText("📋 小组赛", {
  x: 1.1,
  y: 2.2,
  w: 5,
  h: 0.45,
  fontSize: 16,
  fontFace: TITLE_FONT,
  color: RED,
  bold: true,
});

s4.addText(
  [
    { text: "• 石宇奇因病缺席部分场次\n", options: { fontSize: 12 } },
    { text: "• 李诗沣临危出任一单\n", options: { fontSize: 12 } },
    { text: "• 2:1 险胜印度队\n", options: { fontSize: 12 } },
    { text: "• 以小组第一出线", options: { fontSize: 12, bold: true } },
  ],
  {
    x: 1.1,
    y: 2.8,
    w: 5,
    h: 1.8,
    fontFace: BODY_FONT,
    color: DARKTEXT,
    lineSpacingMultiple: 1.8,
  },
);

// Roadmap - Knockout
s4.addShape(pptx.ShapeType.rect, {
  x: 7.0,
  y: 2.0,
  w: 5.5,
  h: 2.8,
  fill: { color: WHITE },
  shadow: { type: "outer", blur: 6, offset: 3, color: "D0D0D0", opacity: 0.3 },
  rectRadius: 0.1,
});

s4.addText("⚔️ 淘汰赛", {
  x: 7.3,
  y: 2.2,
  w: 5,
  h: 0.45,
  fontSize: 16,
  fontFace: TITLE_FONT,
  color: RED,
  bold: true,
});

s4.addText(
  [
    { text: "• 石宇奇回归，全队士气大振\n", options: { fontSize: 12 } },
    { text: "• 零封马来西亚\n", options: { fontSize: 12, bold: true } },
    { text: "• 零封丹麦\n", options: { fontSize: 12, bold: true } },
    { text: "• 强势挺进决赛 → 3:1 法国夺冠", options: { fontSize: 12 } },
  ],
  {
    x: 7.3,
    y: 2.8,
    w: 5,
    h: 1.8,
    fontFace: BODY_FONT,
    color: DARKTEXT,
    lineSpacingMultiple: 1.8,
  },
);

// Arrow between
s4.addText("→", {
  x: 5.2,
  y: 3.0,
  w: 2.9,
  h: 1.0,
  fontSize: 36,
  fontFace: TITLE_FONT,
  color: RED,
  align: "center",
  valign: "middle",
});

// ==================== SLIDE 5: YOU CUP FINAL ====================
const s5 = pptx.addSlide();
darkBg(s5);
darkTitle(s5, "尤伯杯决赛：韩国 3:1 中国");
s5.addText("一路零封晋级，决赛关键分失守", {
  x: 0.8,
  y: 1.3,
  w: 11.7,
  h: 0.5,
  fontSize: 14,
  fontFace: BODY_FONT,
  color: GRAY,
});

// Match cards
const youMatches = [
  { pos: "一单", player: "王祉怡", opponent: "安洗莹", result: "❌ 大比分告负" },
  { pos: "女双", player: "刘圣书/谭宁", opponent: "—", result: "✅ 扳回一分" },
  { pos: "二单", player: "陈雨菲", opponent: "金佳恩", result: "❌ 领先被逆转" },
  { pos: "女双", player: "贾一凡/张殊贤", opponent: "白荷娜/金慧贞", result: "❌ 首局胜后下滑" },
];

youMatches.forEach((m, i) => {
  const yBase = 2.0 + i * 1.2;
  s5.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: yBase,
    w: 11.7,
    h: 1.0,
    fill: { color: "2A2A3E" },
    rectRadius: 0.06,
  });

  s5.addText(m.pos, {
    x: 1.0,
    y: yBase,
    w: 1.0,
    h: 1.0,
    fontSize: 11,
    fontFace: BODY_FONT,
    color: GOLD,
    align: "center",
    valign: "middle",
  });
  s5.addText(m.player, {
    x: 2.2,
    y: yBase,
    w: 3.2,
    h: 1.0,
    fontSize: 15,
    fontFace: TITLE_FONT,
    color: WHITE,
    valign: "middle",
  });
  s5.addText("vs " + m.opponent, {
    x: 5.5,
    y: yBase,
    w: 2.5,
    h: 1.0,
    fontSize: 12,
    fontFace: BODY_FONT,
    color: GRAY,
    valign: "middle",
  });
  s5.addText(m.result, {
    x: 8.2,
    y: yBase,
    w: 4.0,
    h: 1.0,
    fontSize: 14,
    fontFace: BODY_FONT,
    color: m.result.includes("✅") ? "22C55E" : "EF4444",
    valign: "middle",
    bold: true,
  });
});

// ==================== SLIDE 6: MEN'S TEAM STATS ====================
const s6 = pptx.addSlide();
lightBg(s6);
lightTitle(s6, "汤姆斯杯 · 男队选手成绩");

const menStats = [
  {
    player: "石宇奇",
    role: "一单 / 队长",
    record: "多胜",
    note: "克服急性肠胃炎，决赛85分钟苦战胜",
  },
  { player: "李诗沣", role: "二单", record: "5胜1负", note: "全队唯一全程出战，缺阵时扛起一单" },
  { player: "翁泓阳", role: "三单", record: "决赛封神", note: "96分钟鏖战，锁定冠军点" },
  { player: "梁伟铿/王昶", role: "一双", record: "5战全胜", note: "最稳定发挥，世界一流水准" },
  { player: "任翔宇/何济霆", role: "二双", record: "关键先生", note: "再次在决赛锁定制胜分" },
];

menStats.forEach((m, i) => {
  const yBase = 1.6 + i * 1.05;

  // Card background
  s6.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: yBase,
    w: 11.7,
    h: 0.85,
    fill: { color: i % 2 === 0 ? WHITE : LIGHTGRAY },
    rectRadius: 0.06,
  });

  // Player name
  s6.addText(m.player, {
    x: 1.1,
    y: yBase,
    w: 2.8,
    h: 0.85,
    fontSize: 16,
    fontFace: TITLE_FONT,
    color: DARK,
    valign: "middle",
  });

  // Role
  s6.addText(m.role, {
    x: 4.0,
    y: yBase,
    w: 2.0,
    h: 0.85,
    fontSize: 11,
    fontFace: BODY_FONT,
    color: GRAY,
    valign: "middle",
  });

  // Record
  s6.addText(m.record, {
    x: 6.2,
    y: yBase,
    w: 2.0,
    h: 0.85,
    fontSize: 14,
    fontFace: TITLE_FONT,
    color: RED,
    valign: "middle",
    bold: true,
  });

  // Note
  s6.addText(m.note, {
    x: 8.0,
    y: yBase,
    w: 4.2,
    h: 0.85,
    fontSize: 11,
    fontFace: BODY_FONT,
    color: DARKTEXT,
    valign: "middle",
  });
});

// ==================== SLIDE 7: WOMEN'S TEAM STATS ====================
const s7 = pptx.addSlide();
lightBg(s7);
lightTitle(s7, "尤伯杯 · 女队选手成绩");

const womenStats = [
  { player: "王祉怡", role: "一单", record: "4胜1负", note: "首次担任一单，决赛不敌世界第一" },
  { player: "陈雨菲", role: "二单", record: "—", note: "决赛关键场次被逆转，比赛转折点" },
  {
    player: "刘圣书/谭宁",
    role: "一双",
    record: "5战全胜",
    note: "首次站上一双，展现世界第一水准",
  },
  { player: "贾一凡/张殊贤", role: "二双", record: "—", note: "新老组合，多拍相持不及对手" },
  { player: "徐文婧", role: "新人", record: "3战全胜", note: "18岁小将，首次出战尤杯" },
];

womenStats.forEach((m, i) => {
  const yBase = 1.6 + i * 1.05;

  s7.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: yBase,
    w: 11.7,
    h: 0.85,
    fill: { color: i % 2 === 0 ? WHITE : LIGHTGRAY },
    rectRadius: 0.06,
  });

  s7.addText(m.player, {
    x: 1.1,
    y: yBase,
    w: 2.8,
    h: 0.85,
    fontSize: 16,
    fontFace: TITLE_FONT,
    color: DARK,
    valign: "middle",
  });

  s7.addText(m.role, {
    x: 4.0,
    y: yBase,
    w: 2.0,
    h: 0.85,
    fontSize: 11,
    fontFace: BODY_FONT,
    color: GRAY,
    valign: "middle",
  });

  s7.addText(m.record, {
    x: 6.2,
    y: yBase,
    w: 2.0,
    h: 0.85,
    fontSize: 14,
    fontFace: TITLE_FONT,
    color: RED,
    valign: "middle",
    bold: true,
  });

  s7.addText(m.note, {
    x: 8.0,
    y: yBase,
    w: 4.2,
    h: 0.85,
    fontSize: 11,
    fontFace: BODY_FONT,
    color: DARKTEXT,
    valign: "middle",
  });
});

// ==================== SLIDE 8: HIGHLIGHTS ====================
const s8 = pptx.addSlide();
darkBg(s8);
darkTitle(s8, "赛事亮点");

// Four highlight cards in 2x2 grid
const highlights = [
  {
    icon: "⏱️",
    title: "96分钟封神",
    desc: "翁泓阳决赛三局鏖战，比分 22:20 / 20:22 / 21:19，锁定冠军点",
  },
  {
    icon: "🛡️",
    title: "5战全胜",
    desc: "梁伟铿/王昶（男双）& 刘圣书/谭宁（女双）双双打出完美战绩",
  },
  { icon: "🔥", title: "零封晋级", desc: "女队决赛前一路零封对手，展现强大整体实力" },
  { icon: "🌟", title: "00后崛起", desc: "18岁徐文婧首次出战尤杯，小组赛3战全胜，未来可期" },
];

highlights.forEach((h, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const xBase = 0.8 + col * 6.0;
  const yBase = 1.8 + row * 2.6;

  s8.addShape(pptx.ShapeType.rect, {
    x: xBase,
    y: yBase,
    w: 5.6,
    h: 2.2,
    fill: { color: "2A2A3E" },
    rectRadius: 0.1,
  });

  s8.addText(h.icon, {
    x: xBase + 0.3,
    y: yBase + 0.2,
    w: 0.7,
    h: 0.7,
    fontSize: 28,
    align: "center",
  });

  s8.addText(h.title, {
    x: xBase + 1.1,
    y: yBase + 0.2,
    w: 4.2,
    h: 0.6,
    fontSize: 18,
    fontFace: TITLE_FONT,
    color: WHITE,
    bold: true,
  });

  s8.addText(h.desc, {
    x: xBase + 1.1,
    y: yBase + 0.9,
    w: 4.2,
    h: 1.1,
    fontSize: 12,
    fontFace: BODY_FONT,
    color: GRAY,
    lineSpacingMultiple: 1.5,
  });
});

// ==================== SLIDE 9: CONCLUSION ====================
const s9 = pptx.addSlide();
darkBg(s9);

// Decorative red bar at top
s9.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: RED } });

s9.addText("谢谢", {
  x: 0,
  y: 2.0,
  w: 13.33,
  h: 1.5,
  fontSize: 56,
  fontFace: TITLE_FONT,
  color: WHITE,
  bold: true,
  align: "center",
  valign: "middle",
});

s9.addShape(pptx.ShapeType.rect, { x: 5.8, y: 3.5, w: 1.7, h: 0.05, fill: { color: GOLD } });

s9.addText("2026 汤姆斯杯 & 尤伯杯 · 国羽成绩报告", {
  x: 0,
  y: 3.9,
  w: 13.33,
  h: 0.6,
  fontSize: 16,
  fontFace: BODY_FONT,
  color: GRAY,
  align: "center",
});

s9.addText("数据来源：新华社 / 国家体育总局 / 百度百家号", {
  x: 0,
  y: 5.8,
  w: 13.33,
  h: 0.4,
  fontSize: 11,
  fontFace: BODY_FONT,
  color: "555555",
  align: "center",
});

// ==================== SAVE ====================
const outPath = process.argv[2] || "slides.pptx";
pptx
  .writeFile({ fileName: outPath })
  .then(() => {
    console.log("PPTX saved to: " + outPath);
  })
  .catch((err) => {
    console.error("Error:", err);
  });
