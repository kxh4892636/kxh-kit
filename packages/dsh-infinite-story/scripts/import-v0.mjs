#!/usr/bin/env node
/**
 * One-shot migration: v0 `.tmp/mama-story` → v1 `.story/<id>`.
 *
 * v0 layout: canon/*.md + rules/*.md + world/world.json + state.json + chapters/
 * v1 layout: STORY.md + RULES.md + WORLD.md + shards/*.md + rules/*.md + json state
 *
 * Chapters are copied byte-for-byte. Prose canon (characters, world, style) is
 * copied **whole** into shards — summarising it loses exactly the detail the
 * writer needs. Only the JSON is re-shaped.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const [, , fromArg, toArg, idArg] = process.argv;
if (!fromArg || !toArg) {
  console.error("用法: node import-v0.mjs <v0-dir> <workspace-dir> [story-id]");
  process.exit(1);
}
const FROM = path.resolve(fromArg);
const WORKSPACE = path.resolve(toArg);
const ID = idArg ?? "mama-story";
const ROOT = path.join(WORKSPACE, ".story", ID);

const readJson = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const exists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};
const readText = async (p) => ((await exists(p)) ? fs.readFile(p, "utf8") : "");
const write = async (p, s) => {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, s, "utf8");
};
const writeJson = (p, v) => write(p, `${JSON.stringify(v, null, 2)}\n`);

const v0State = await readJson(path.join(FROM, "state.json"));
const v0Clock = v0State.clock ?? {};
const v0World = await readJson(path.join(FROM, "world", "world.json"));

// ---------- state ----------
const chapterNo = v0State.cursor.chapterNo ?? 0;
const chapterFile = `${String(chapterNo).padStart(2, "0")}-${(v0State.cursor.chapter ?? "未命名").replace(/^\d+-/, "")}.md`;

const affinity = {};
for (const npc of v0World.npcs ?? []) {
  if (npc.id === "you") continue;
  affinity[npc.name] = { value: npc.affinity?.value ?? 0, level: npc.affinity?.level ?? "中立" };
}

const state = {
  version: 1,
  story: v0State.story ?? ID,
  updatedAt: new Date().toISOString(),
  cursor: {
    // 新字段
    chapter: chapterNo,
    chapterFile,
    scene: v0State.cursor.scene ?? "",
    storyTime: v0Clock.storyNow ?? v0State.cursor.inWorldTime ?? "",
    location: v0State.cursor.location ?? "",
    lastBeat: v0State.cursor.lastBeat ?? "",
    // v0 原有字段原样留住，避免信息损失
    chapterNo: v0State.cursor.chapterNo ?? chapterNo,
    inWorldTime: v0State.cursor.inWorldTime ?? "",
    pov: v0State.cursor.pov ?? "",
    locationId: v0State.cursor.locationId ?? "",
  },
  openThreads: (v0State.openThreads ?? []).filter(Boolean),
  affinity,
  meters: {},
};

const clock = {
  now: v0Clock.storyNow,
  advances: (v0Clock.advances ?? []).map((a) => ({
    from: a.from,
    to: a.to,
    minutes: a.advance ?? 0,
    reason: a.reason ?? "",
  })),
  // v0 的时钟策略与虚拟日历原样保留：Brief 的时间显示依赖 calendar
  type: v0Clock.type ?? "virtual",
  policy: v0Clock.policy ?? "",
  defaultAdvance: v0Clock.defaultAdvance ?? 10,
  calendar: v0Clock.dayLabel ?? {},
};

const beats = (v0State.timedBeats ?? []).map((b) => ({
  id: b.id,
  title: b.title,
  opensAt: b.opensAt,
  expiresAt: b.expiresAt,
  status: b.status,
  payload: b.payload,
}));

const foreshadows = (v0State.foreshadows ?? []).map((f) => ({
  id: f.id,
  label: f.label,
  weight: f.weight,
  status: f.status,
  cue: f.cue,
}));

// ---------- markdown canon, copied whole ----------
const canonChars = await readText(path.join(FROM, "canon", "characters.md"));
const canonWorld = await readText(path.join(FROM, "canon", "world.md"));
const canonClock = await readText(path.join(FROM, "canon", "clock.md"));
const canonBeats = await readText(path.join(FROM, "canon", "beats.md"));
const canonFs = await readText(path.join(FROM, "canon", "foreshadows.md"));
const canonModel = await readText(path.join(FROM, "canon", "world-model.md"));
const styleGuide = await readText(path.join(FROM, "rules", "style-guide.md"));
const storyRules = await readText(path.join(FROM, "rules", "continuation-rules.md"));

/** Pull one `## R<n> · …` section out of the v0 rule file, verbatim. */
function ruleSection(n) {
  const re = new RegExp(`^## R${n} ·[\\s\\S]*?(?=^## |\\Z)`, "m");
  return (storyRules.match(re)?.[0] ?? "").trim();
}

/**
 * R14 mixes two concerns: pacing (story-specific) and advance authority
 * (mechanism, already in the system prompt). Keep only the pacing half so the
 * two files never say the same thing twice.
 */
function rhythmSection() {
  const section = ruleSection(14);
  const match = /^0\. \*\*节奏[\s\S]*?(?=^1\. )/m.exec(section);
  return (match?.[0] ?? section).trim();
}

const npcCard = (n) =>
  [
    `### ${n.name}${n.role ? ` · ${n.role}` : ""}`,
    "",
    n.tags?.length ? `- 标签：${n.tags.join(" / ")}` : "",
    n.tier ? `- 层级：${n.tier}` : "",
    n.note ? `- ${n.note}` : "",
    n.revealed?.length ? `- 已揭示：${n.revealed.map((x) => `${x}`).join("；")}` : "",
    n.hidden?.length
      ? `- 未揭示（可逐步暗示，一次一条）：\n${n.hidden.map((x) => `  - ${x}`).join("\n")}`
      : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");

const byTier = (t) => (v0World.npcs ?? []).filter((n) => n.tier === t && n.id !== "you");

const charsCore = [
  "# 核心人物",
  "",
  "> 全文照搬自 v0 正典，未做摘要。语气样本与禁忌内核对写作有直接约束力。",
  "",
  canonChars,
  "",
  "---",
  "",
  "## 世界观与既定事实",
  "",
  canonWorld,
].join("\n");

const charsMajor = [
  "# 常驻次要人物",
  "",
  ...[...byTier("major"), ...byTier("minor")].map(npcCard),
].join("\n");

const locations = [
  "# 地点",
  "",
  ...(v0World.locations ?? []).map((l) => {
    const focus = Array.isArray(l.focus) ? l.focus.filter(Boolean) : [];
    const links = Array.isArray(l.links) ? l.links : [];
    return [
      `## ${l.name} \`${l.id}\``,
      "",
      l.tags?.length ? `- 性质：${l.tags.join(" / ")}` : "",
      `- 通往：${links.join("、") || "（无）"}`,
      focus.length ? `- 焦点人物：${focus.join("、")}` : "- 焦点人物：无（路人场）",
      l.note ? `- ${l.note}` : "",
      "",
    ]
      .filter(Boolean)
      .join("\n");
  }),
].join("\n");

const threads = [
  "# 故事线",
  "",
  ...(v0World.threads ?? []).map((t) =>
    [
      `## ${t.id} · ${t.title}`,
      "",
      `- 状态：${t.status}`,
      `- 分量：${t.weight}`,
      t.participants?.length ? `- 参与：${t.participants.join("、")}` : "",
      t.dependsOn?.length ? `- 依赖：${t.dependsOn.join("、")}` : "",
      t.note ? `- ${t.note}` : "",
      "",
    ]
      .filter(Boolean)
      .join("\n"),
  ),
  "## 关系",
  "",
  ...(v0World.relations ?? []).map(
    (r) => `- ${r.a} — ${r.type} — ${r.b}${r.secret ? "（隐秘）" : ""}`,
  ),
  "",
].join("\n");

// ---------- docs & world json ----------
const rulesMd = [
  "# 故事规则（本故事特有）",
  "",
  "> 分界：**机制**由插件注入系统提示——落盘 R8、时间 R13、节点 R15、世界 R17/R19、渐进人设 R18、伏笔 R11、收账 R24、知情边界 R20、推进权 R1/R14（1–5）、不出戏 R7。本文件只写**写法与关系**，不重复上述任何一条。",
  "",
  "## 篇幅（R2）",
  "",
  ruleSection(2) || "（v0 缺 R2）",
  "",
  "## 描写配比（R3）",
  "",
  ruleSection(3) || "（v0 缺 R3）",
  "",
  "## 风格（R4）",
  "",
  ruleSection(4) || "（v0 缺 R4）",
  "",
  "## 露骨度（R5）",
  "",
  ruleSection(5) || "（v0 缺 R5）",
  "",
  "## 视角与人称（R6）",
  "",
  ruleSection(6) || "（v0 缺 R6）",
  "",
  "## 关系与禁忌（R10 · 最高优先）",
  "",
  ruleSection(10) || "（v0 缺 R10）",
  "",
  "## 沉浸与交互（R12）",
  "",
  ruleSection(12) || "（v0 缺 R12）",
  "",
  "## 节奏（R14 · 只取节奏部分，推进权归系统提示）",
  "",
  rhythmSection() || "（v0 缺 R14）",
  "",
  "## 衔接（R16）",
  "",
  ruleSection(16) || "（v0 缺 R16）",
  "",
  "## 括号旁注（R22）",
  "",
  ruleSection(22) || "（v0 缺 R22）",
  "",
  ...(styleGuide
    ? ["", "---", "", "## 附：文风与调性（v0 style-guide 全文，唯一权威）", "", styleGuide]
    : []),
].join("\n");

const toChar = (n) => ({
  id: n.id,
  name: n.name,
  role: n.role,
  tier: n.tier,
  tags: n.tags ?? [],
  affinity: n.affinity ?? null,
  knows: n.knows ?? [],
  auto: n.auto ?? false,
  revealed: n.revealed ?? [],
  hidden: n.hidden ?? [],
  note: n.note ?? "",
});

const charsJson = {
  core: (v0World.npcs ?? []).filter((n) => n.tier === "core").map(toChar),
  major: (v0World.npcs ?? []).filter((n) => n.tier === "major").map(toChar),
  minor: (v0World.npcs ?? []).filter((n) => n.tier === "minor").map(toChar),
  prose: "world/characters.md",
  note: "prose 指向人设散文全文（语气样本、禁忌内核、关系动态）；本文件只放可查的结构化字段。",
};

const storyEntry = {
  version: 1,
  story: state.story,
  updatedAt: state.updatedAt,
  cursor: state.cursor,
  openThreads: state.openThreads,
  affinity: state.affinity,
  meters: state.meters,
  // v0 的运行时字段全部保留：它们会影响 Brief 与下一拍判断
  characters: v0State.characters ?? {},
  physicalState: v0State.physicalState ?? {},
  props: v0State.props ?? [],
  revisions: v0State.revisions ?? [],
  policies: {
    foreshadow: v0State.foreshadowPolicy ?? null,
    beat: v0State.beatPolicy ?? null,
  },
  calendar: v0Clock.dayLabel ?? {},
  limits: v0World.limits ?? null,
  files: {
    rules: "rules.md",

    chars: "world/chars.json",
    charactersProse: "world/characters.md",
    locations: "world/locations.json",
    threads: "world/threads.json",
    relations: "world/relations.json",
    worldNotes: "world/world-notes.md",
    clock: "clock.json",
    beats: "beats.json",
    foreshadows: "foreshadows.json",
    chapters: "chapters/",
    archive: "archive/",
  },
};

// ---------- write ----------
await fs.rm(ROOT, { recursive: true, force: true });
for (const d of ["world", "chapters", "log", "archive"]) {
  await fs.mkdir(path.join(ROOT, d), { recursive: true });
}

const srcChapters = path.join(FROM, "chapters");
const names = (await fs.readdir(srcChapters)).filter((n) => n.endsWith(".md")).sort();
for (const n of names) {
  await fs.copyFile(path.join(srcChapters, n), path.join(ROOT, "chapters", n));
}

await writeJson(path.join(ROOT, "story.json"), storyEntry);
await writeJson(path.join(ROOT, "clock.json"), clock);
await writeJson(path.join(ROOT, "beats.json"), beats);
await writeJson(path.join(ROOT, "foreshadows.json"), foreshadows);

await write(path.join(ROOT, "rules.md"), rulesMd);

await writeJson(path.join(ROOT, "world", "chars.json"), charsJson);
await writeJson(path.join(ROOT, "world", "locations.json"), v0World.locations ?? []);
await writeJson(path.join(ROOT, "world", "threads.json"), v0World.threads ?? []);
await writeJson(path.join(ROOT, "world", "relations.json"), v0World.relations ?? []);

if (canonChars) await write(path.join(ROOT, "world", "characters.md"), canonChars);
if (canonWorld) await write(path.join(ROOT, "world", "world-notes.md"), canonWorld);

for (const f of ["timeline.jsonl", "affinity.jsonl", "npc.jsonl"]) {
  const src = path.join(FROM, "log", f);
  if (await exists(src)) await fs.copyFile(src, path.join(ROOT, "log", f));
}

// 归档：v0 的机制细则与世界模型原样保留，运行时不读，但内容不丢
await fs.mkdir(path.join(ROOT, "archive"), { recursive: true });
for (const [src, name] of [
  ["canon/clock.md", "clock.md"],
  ["canon/beats.md", "beats.md"],
  ["canon/foreshadows.md", "foreshadows.md"],
  ["canon/world-model.md", "world-model.md"],
  ["canon/characters.md", "characters.full.md"],
  ["canon/world.md", "world.full.md"],
  ["rules/style-guide.md", "style-guide.md"],
  ["rules/continuation-rules.md", "continuation-rules.md"],
  ["log/expired.md", "expired.md"],
]) {
  const from = path.join(FROM, src);
  if (await exists(from)) await fs.copyFile(from, path.join(ROOT, "archive", name));
}

await fs.mkdir(path.join(WORKSPACE, ".story", "sessions"), { recursive: true });
await writeJson(path.join(WORKSPACE, ".story", "active.json"), {
  storyId: ID,
  entry: `./${ID}/story.json`,
  rules: `./${ID}/rules.md`,
  updatedAt: new Date().toISOString(),
});

const size = async (p) => ((await exists(p)) ? (await fs.stat(p)).size : 0);
console.log(`migrated → ${ROOT}`);
console.log(`chapters: ${names.length}`);
console.log(
  `beats: ${beats.length}  foreshadows: ${foreshadows.length}  affinity: ${Object.keys(affinity).length}`,
);
console.log(`rules.md ${await size(path.join(ROOT, "rules.md"))}B`);
console.log(`world/chars.json ${await size(path.join(ROOT, "world", "chars.json"))}B`);
console.log(`world/characters.md ${await size(path.join(ROOT, "world", "characters.md"))}B`);
console.log();
