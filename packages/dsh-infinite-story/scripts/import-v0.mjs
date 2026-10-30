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
    chapter: chapterNo,
    chapterFile,
    scene: v0State.cursor.scene ?? "",
    storyTime: v0Clock.storyNow ?? v0State.cursor.inWorldTime ?? "",
    location: v0State.cursor.location ?? "",
    lastBeat: v0State.cursor.lastBeat ?? "",
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

// ---------- entry docs ----------
const storyMd = `# ${state.story}

## 现在
第 ${state.cursor.chapter} 章 · ${state.cursor.scene}
上一拍：${state.cursor.lastBeat}

## 去哪查
- 本故事规则 → [RULES.md](./RULES.md)
- 写法与调性 → [rules/style-guide.md](./rules/style-guide.md)
- 人物（含语气样本、禁忌内核）→ [shards/chars-core.md](./shards/chars-core.md)
- 配角 → [shards/chars-major.md](./shards/chars-major.md)
- 地点 → [shards/locations.md](./shards/locations.md)
- 线与关系 → [shards/threads.md](./shards/threads.md)
- 时钟细则 → [shards/clock.md](./shards/clock.md)
- 节点细则 → [shards/beats.md](./shards/beats.md)
- 伏笔库 → [shards/foreshadows.md](./shards/foreshadows.md)
- 世界模型 → [shards/world-model.md](./shards/world-model.md)

## 悬置
${state.openThreads.map((t) => `- ${t}`).join("\n") || "- （无）"}
`;

const rulesMd = [
  "# 故事规则（本故事特有）",
  "",
  "> 通用机制规则由插件注入系统提示，不在这里重复。这里是本故事独有的约束，全文照搬 v0，未做摘要。",
  "",
  "## 关系与禁忌（最高优先）",
  "",
  ruleSection(10) || "（v0 缺 R10）",
  "",
  "## 知情边界",
  "",
  ruleSection(20) || "（v0 缺 R20）",
  "",
  "## 衔接",
  "",
  ruleSection(16) || "（v0 缺 R16）",
  "",
  "## 括号旁注",
  "",
  ruleSection(22) || "（v0 缺 R22）",
  "",
  "## 沉浸与交互",
  "",
  ruleSection(12) || "（v0 缺 R12）",
  "",
  "## 节奏",
  "",
  ruleSection(14) || "（v0 缺 R14）",
  "",
  "## 存档义务",
  "",
  ruleSection(8) || "（v0 缺 R8）",
  "",
].join("\n");

const worldMd = [
  "# 世界索引",
  "",
  "| 册 | 内容 |",
  "|---|---|",
  "| [chars-core](./shards/chars-core.md) | 白洁与筱聿的正典全文：人设、语气样本、禁忌内核、关系动态、既定事实 |",
  "| [chars-major](./shards/chars-major.md) | 周老师、林、李老师、张阿姨、韦：身份、已知、未揭示 |",
  "| [locations](./shards/locations.md) | 十处场景，含邻接与焦点人物 |",
  "| [threads](./shards/threads.md) | 六条故事线、依赖关系、社交边 |",
  "| [clock](./shards/clock.md) | 虚拟时钟与推进细则 |",
  "| [beats](./shards/beats.md) | 时效节点细则与过期记录 |",
  "| [foreshadows](./shards/foreshadows.md) | 伏笔库与触发记录 |",
  "| [world-model](./shards/world-model.md) | 多场景/多人物/多线架构与扩容预案 |",
  "",
].join("\n");

// ---------- write ----------
await fs.rm(ROOT, { recursive: true, force: true });
for (const d of ["shards", "chapters", "log", "rules"]) {
  await fs.mkdir(path.join(ROOT, d), { recursive: true });
}

const srcChapters = path.join(FROM, "chapters");
const names = (await fs.readdir(srcChapters)).filter((n) => n.endsWith(".md")).sort();
for (const n of names) {
  await fs.copyFile(path.join(srcChapters, n), path.join(ROOT, "chapters", n));
}

await writeJson(path.join(ROOT, "state.json"), state);
await writeJson(path.join(ROOT, "clock.json"), clock);
await writeJson(path.join(ROOT, "beats.json"), beats);
await writeJson(path.join(ROOT, "foreshadows.json"), foreshadows);

await write(path.join(ROOT, "STORY.md"), storyMd);
await write(path.join(ROOT, "RULES.md"), rulesMd);
await write(path.join(ROOT, "WORLD.md"), worldMd);

await write(path.join(ROOT, "shards", "chars-core.md"), charsCore);
await write(path.join(ROOT, "shards", "chars-major.md"), charsMajor);
await write(path.join(ROOT, "shards", "locations.md"), locations);
await write(path.join(ROOT, "shards", "threads.md"), threads);
if (canonClock) await write(path.join(ROOT, "shards", "clock.md"), canonClock);
if (canonBeats) await write(path.join(ROOT, "shards", "beats.md"), canonBeats);
if (canonFs) await write(path.join(ROOT, "shards", "foreshadows.md"), canonFs);
if (canonModel) await write(path.join(ROOT, "shards", "world-model.md"), canonModel);

if (styleGuide) await write(path.join(ROOT, "rules", "style-guide.md"), styleGuide);
if (storyRules) await write(path.join(ROOT, "rules", "continuation-rules.md"), storyRules);

for (const f of ["timeline.jsonl", "affinity.jsonl", "npc.jsonl"]) {
  const src = path.join(FROM, "log", f);
  if (await exists(src)) await fs.copyFile(src, path.join(ROOT, "log", f));
}

await fs.mkdir(path.join(WORKSPACE, ".story", "sessions"), { recursive: true });

const size = async (p) => ((await exists(p)) ? (await fs.stat(p)).size : 0);
console.log(`migrated → ${ROOT}`);
console.log(`chapters: ${names.length}`);
console.log(
  `beats: ${beats.length}  foreshadows: ${foreshadows.length}  affinity: ${Object.keys(affinity).length}`,
);
console.log(`RULES.md ${await size(path.join(ROOT, "RULES.md"))}B`);
console.log(`shards/chars-core.md ${await size(path.join(ROOT, "shards", "chars-core.md"))}B`);
console.log(`rules/style-guide.md ${await size(path.join(ROOT, "rules", "style-guide.md"))}B`);
console.log(
  `rules/continuation-rules.md ${await size(path.join(ROOT, "rules", "continuation-rules.md"))}B`,
);
