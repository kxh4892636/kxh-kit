#!/usr/bin/env node
/**
 * One-shot migration: v0 `.tmp/mama-story` → v1 `.story/<id>`.
 *
 * v0 layout: canon/*.md + rules/*.md + world/world.json + state.json + chapters/
 * v1 layout: STORY.md + RULES.md + WORLD.md + shards/*.md + state/clock/beats/foreshadows.json
 *
 * Chapters are copied byte-for-byte. JSON is re-shaped, never re-worded.
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

// ---------- shards ----------
const npcCard = (n) =>
  [
    `## ${n.name}${n.role ? ` · ${n.role}` : ""}`,
    "",
    n.tags?.length ? `- 标签：${n.tags.join(" / ")}` : "",
    n.affinity ? `- 好感：${n.affinity.value}（${n.affinity.level}）` : "",
    n.tier ? `- 层级：${n.tier}` : "",
    n.knows?.length ? `- 已知：${n.knows.join("、")}` : "- 已知：无",
    n.note ? `- ${n.note}` : "",
    n.hidden?.length ? `- 未揭示：${n.hidden.length} 条` : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");

const byTier = (t) => (v0World.npcs ?? []).filter((n) => n.tier === t && n.id !== "you");
const charsCore = [
  "# 核心人物",
  "",
  ...(v0World.npcs ?? []).filter((n) => n.tier === "core").map(npcCard),
].join("\n");
const charsMajor = ["# 常驻次要人物", "", ...byTier("major").map(npcCard)].join("\n");
const charsMinor = ["# 小角色", "", ...byTier("minor").map(npcCard)].join("\n");

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
].join("\n");

const relations = [
  "# 关系",
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
- 规则 → [RULES.md](./RULES.md)
- 世界 → [WORLD.md](./WORLD.md)
- 人物 → [核心](./shards/chars-core.md) / [常驻](./shards/chars-major.md) / [小角色](./shards/chars-minor.md)
- 地点 → [locations](./shards/locations.md)
- 线 → [threads](./shards/threads.md)

## 悬置
${state.openThreads.map((t) => `- ${t}`).join("\n") || "- （无）"}
`;

const rulesMd = await (async () => {
  const parts = ["# 故事规则（故事特有）", ""];
  const canonChars = path.join(FROM, "canon", "characters.md");
  if (await exists(canonChars)) {
    const md = await fs.readFile(canonChars, "utf8");
    const m = /## 禁忌线的写法（硬要求）([\s\S]*?)(?=\n## |$)/.exec(md);
    if (m) parts.push("## 禁忌线", m[1].trim(), "");
  }
  const style = path.join(FROM, "rules", "style-guide.md");
  if (await exists(style)) {
    const md = await fs.readFile(style, "utf8");
    const m = /## 禁忌调性（乱伦线的专用笔法）([\s\S]*?)(?=\n## |$)/.exec(md);
    if (m) parts.push("## 禁忌调性", m[1].trim(), "");
  }
  parts.push("## 节奏");
  parts.push("- 慢写：亲密、对峙、她说起以前");
  parts.push("- 跳过：通勤、上课、写作业、等结果");
  parts.push("");
  return parts.join("\n");
})();

const worldMd = [
  "# 世界索引",
  "",
  "- [核心人物](./shards/chars-core.md)",
  "- [常驻次要](./shards/chars-major.md)",
  "- [小角色](./shards/chars-minor.md)",
  "- [地点](./shards/locations.md)",
  "- [故事线](./shards/threads.md)",
  "- [关系](./shards/relations.md)",
  "",
].join("\n");

// ---------- write ----------
await fs.rm(ROOT, { recursive: true, force: true });
await fs.mkdir(path.join(ROOT, "shards"), { recursive: true });
await fs.mkdir(path.join(ROOT, "chapters"), { recursive: true });
await fs.mkdir(path.join(ROOT, "log"), { recursive: true });

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
await write(path.join(ROOT, "shards", "chars-minor.md"), charsMinor);
await write(path.join(ROOT, "shards", "locations.md"), locations);
await write(path.join(ROOT, "shards", "threads.md"), threads);
await write(path.join(ROOT, "shards", "relations.md"), relations);

// logs
for (const f of ["timeline.jsonl", "affinity.jsonl", "npc.jsonl"]) {
  const src = path.join(FROM, "log", f);
  if (await exists(src)) await fs.copyFile(src, path.join(ROOT, "log", f));
}
await write(
  path.join(ROOT, "log", "timeline.jsonl"),
  (await exists(path.join(FROM, "log", "timeline.jsonl")))
    ? await fs.readFile(path.join(FROM, "log", "timeline.jsonl"), "utf8")
    : "",
);

// ACTIVE pointer
await write(
  path.join(WORKSPACE, ".story", "ACTIVE.md"),
  [
    "# 当前故事",
    "",
    `- 入口：./${ID}/STORY.md`,
    `- 规则：./${ID}/RULES.md`,
    `- 分片：./${ID}/shards/`,
    "",
  ].join("\n"),
);

console.log(`migrated → ${ROOT}`);
console.log(`chapters: ${names.length}`);
console.log(
  `beats: ${beats.length}  foreshadows: ${foreshadows.length}  affinity: ${Object.keys(affinity).length}`,
);
