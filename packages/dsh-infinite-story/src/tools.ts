import { promises as fs } from "node:fs";
import path from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import {
  chapterChars as walCharsOf,
  finishedChars,
  loadSnapshot,
  makeSnapshot,
  saveSnapshot,
  type ExpansionInput,
} from "./budget.js";
import { briefIsFresh, writeBrief, type ReviewResult } from "./brief.js";
import { autoRepair } from "./repair.js";
import { isDuplicate, nextId, parseSeeds } from "./foreshadow.js";
import { levelOf } from "./model.js";
import type { Foreshadow, GuardIssue, StoryBundle } from "./model.js";
import { IRON_RULES, SECTION_NAME, SECTION_ORDER } from "./prompt.js";
import {
  LAYOUT,
  listStories,
  readActive,
  readStory,
  writeActive,
  writeJson,
  writeText,
} from "./store.js";

export interface ToolDeps {
  /** Absolute workspace root — where `.story/` lives. */
  workspace: () => string;
  fallbackCtx: Ctx;
}

type Disposer = () => void;
interface LlmChunk {
  type?: string;
  text?: string;
  delta?: string;
}

interface LlmService {
  stream: (options: {
    provider: string;
    model: string;
    messages: Array<{ role: "user"; content: Array<{ type: "text"; text: string }> }>;
  }) => AsyncIterable<LlmChunk>;
}

interface ModelSelector {
  current: () => { provider: string; model: string };
}

interface Ctx {
  tools: { register: (def: unknown) => Disposer };
  systemPrompt: { section: (sec: unknown) => unknown };
  llm?: LlmService;
  agentDefaultModel?: ModelSelector;
  get?: (name: string) => unknown;
}

const text = (value: string) => [{ type: "text" as const, text: value }];

async function chaptersOf(root: string): Promise<string[]> {
  try {
    return (await fs.readdir(path.join(root, LAYOUT.chapters)))
      .filter((n) => n.endsWith(".md"))
      .sort();
  } catch {
    return [];
  }
}

async function pendingIssues(root: string): Promise<GuardIssue[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(root, LAYOUT.pending), "utf8")) as GuardIssue[];
  } catch {
    return [];
  }
}

async function savePending(root: string, issues: GuardIssue[]): Promise<void> {
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length === 0) {
    await fs.rm(path.join(root, LAYOUT.pending), { force: true }).catch(() => {});
    return;
  }
  await writeJson(path.join(root, LAYOUT.pending), errors);
}

/** 以原文的时区偏移推进时间，输出保持同样的 `+08:00` 形式。 */
function shiftIso(from: string, minutes: number): string {
  const offset = /([+-]\d{2}:\d{2})$/.exec(from)?.[1] ?? "+00:00";
  const sign = offset.startsWith("-") ? -1 : 1;
  const offsetMinutes = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
  const shifted = new Date(new Date(from).getTime() + minutes * 60_000 + offsetMinutes * 60_000);
  return `${shifted.toISOString().slice(0, 19)}${offset}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const slug = (t: string) => t.replace(/[\\/:*?"<>|\s]/g, "") || "未命名";

const NO_STORY = "还没有绑定故事：调用 story_mode action=bind id=<故事目录>。";

/** 本章正文字数：优先数 WAL，没有就取 index 里已生成的这一章。 */
async function chapterCharsNow(root: string, chapter: number): Promise<number> {
  const wal = await walCharsOf(root, chapter);
  if (wal > 0) return wal;
  try {
    const raw = await fs.readFile(path.join(root, LAYOUT.chapters, "index.json"), "utf8");
    const index = JSON.parse(raw) as Array<{ no?: number; chars?: number }>;
    const hit = index.find((e) => e.no === chapter);
    return typeof hit?.chars === "number" ? hit.chars : 0;
  } catch {
    return 0;
  }
}

/** 扩张预算的输入：章末快照 + 本章字数。 */
async function expansionOf(bundle: StoryBundle, chapter: number): Promise<ExpansionInput> {
  return {
    snapshot: await loadSnapshot(bundle.root),
    chapter,
    chapterChars: await chapterCharsNow(bundle.root, chapter),
  };
}

async function loadBound(workspace: string): Promise<StoryBundle> {
  const id = await readActive(workspace);
  if (!id) throw new Error(NO_STORY);
  const bundle = await readStory(workspace, id);
  if (!bundle) throw new Error(`绑定的故事目录损坏或不存在：.story/${id}`);
  return bundle;
}

/** 章末把这一章埋下的伏笔写进 foreshadows.json（埋哪几条由模型给）。 */
/** 章末语义审：用主会话同一个模型判这一章有没有跑偏；结论只进 brief。 */
async function reviewChapter(
  ctx: Ctx,
  bundle: StoryBundle,
  chapterText: string,
): Promise<ReviewResult | null> {
  const llm = ctx.llm ?? (ctx.get?.("llm") as LlmService | undefined);
  const selector =
    ctx.agentDefaultModel ?? (ctx.get?.("agentDefaultModel") as ModelSelector | undefined);
  if (!llm || !selector) return null;

  let provider = "";
  let model = "";
  try {
    const current = selector.current();
    provider = current.provider;
    model = current.model;
  } catch {
    return null;
  }
  if (!provider || !model) return null;

  let rules = "";
  try {
    rules = (await fs.readFile(path.join(bundle.root, LAYOUT.rules), "utf8")).slice(0, 3000);
  } catch {
    rules = "";
  }
  const cast = bundle.world.chars.map((c) => `${c.name}（${c.id}）`).join("、");
  const prompt = [
    "你是读者视角的审稿人。只判这一章有没有跑偏，不改稿，不夸奖。",
    `世界：人物 ${cast}；故事线 ${bundle.world.threads.map((t) => `${t.id} ${t.title ?? ""}`).join("、")}`,
    "判据（违反任意一条即算漂移）：",
    "1. 设定冲突：与 rules.md 的禁忌、称呼、篇幅、既成事实相抵触。",
    "2. 人物走形：语气、自称、口癖、行为不像该人物。",
    "3. 知情越界：秘密被不该知道的人知道；旁人显得「意味深长」。",
    "4. 弧未成立：本章没有提出—推动—落地的变化，或停在半空。",
    "5. 伏笔失配：正文写了却没登记，或登记了 cue 完全没落到动作上。",
    '只输出 JSON：{"pass":true|false,"violations":[{"rule":"判据编号","evidence":"原文片段","fix":"一句话怎么改"}],"suggestion":"一句话"}',
    "",
    "故事规则（节选）：",
    rules,
    "",
    "本章正文：",
    chapterText.slice(-8000),
  ].join("\n");

  let out = "";
  try {
    for await (const chunk of llm.stream({
      provider,
      model,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    })) {
      const piece = chunk.text ?? chunk.delta ?? "";
      if (typeof piece === "string") out += piece;
    }
  } catch {
    return null;
  }
  const match = /\{[\s\S]*\}/.exec(out);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as ReviewResult;
    return {
      pass: Boolean(parsed.pass),
      violations: Array.isArray(parsed.violations) ? parsed.violations.slice(0, 8) : [],
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
    };
  } catch {
    return null;
  }
}
async function plantForeshadows(bundle: StoryBundle, declared?: string): Promise<Foreshadow[]> {
  const file = path.join(bundle.root, LAYOUT.foreshadows);
  let all: Foreshadow[] = [];
  try {
    all = JSON.parse(await fs.readFile(file, "utf8")) as Foreshadow[];
  } catch {
    return [];
  }
  const added: Foreshadow[] = [];
  for (const seed of parseSeeds(declared)) {
    const open = all.filter((f) => f.status === "未触发").length + added.length;
    if (open >= 12) break;
    if (isDuplicate(seed, [...all, ...added])) continue;
    added.push({
      id: nextId([...all, ...added]),
      label: seed.label,
      weight: seed.weight,
      status: "未触发",
      cue: seed.cue,
    });
  }
  if (added.length === 0) return [];
  await writeJson(file, [...all, ...added]);
  return added;
}

/**
 * Story mode.
 *
 * Mounting this plugin IS the switch: the "故事模式" agent preset carries the row,
 * so selecting the preset turns story mode on and selecting another preset turns it
 * off. No per-session file, no UI toggle — the preset selector is the UI.
 *
 * What the preset does not decide is *which* story: that lives in
 * `.story/active.json`, so many sessions can run the same preset against one story.
 */
export function createRuntime(deps: ToolDeps) {
  const workspace = deps.workspace;
  const disposers: Disposer[] = [];

  const section = deps.fallbackCtx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text: IRON_RULES,
    interpolate: false,
  });
  if (typeof section === "function") disposers.push(section as Disposer);

  disposers.push(
    deps.fallbackCtx.tools.register(
      defineTool({
        name: "story_mode",
        description:
          "故事模式已由「故事模式」预设开启。本工具只做两件事：status 看当前绑定与可用故事；bind 切换本工作区绑定的故事。",
        parameters: {
          action: { type: "string", required: true, description: "status | bind" },
          id: { type: "string", description: "bind 时的故事目录名" },
        },
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute(args: { action: string; id?: string }) {
          const ws = workspace();
          const bound = await readActive(ws);
          const ids = await listStories(ws);

          if (args.action === "status") {
            return [
              "故事模式：已开启（由预设挂载）",
              `绑定：${bound ?? "（无）"}`,
              ids.length
                ? `可用故事：\n${ids.map((i) => `${i === bound ? "▶" : " "} ${i}`).join("\n")}`
                : "可用故事：（还没有，先在 .story/ 下建一个）",
            ].join("\n");
          }

          if (args.action === "bind") {
            const id = args.id;
            if (!id) return `bind 需要 id。可用：${ids.join("、") || "（无）"}`;
            if (!(await readStory(ws, id))) return `没有这个故事：${id}`;
            await writeActive(ws, id);
            return `已绑定：${id}\n调用 story_open 拿 Brief。`;
          }

          return "未知 action。可用：status | bind";
        },
      }),
    ),
  );

  disposers.push(
    deps.fallbackCtx.tools.register(
      defineTool({
        name: "story_open",
        description:
          "打开绑定的故事，返回操作手册（此刻、上一拍、悬置、伏笔、待修问题）。不跑校验。",
        parameters: {},
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute() {
          const ws = workspace();
          const bundle = await loadBound(ws);
          const pending = await pendingIssues(bundle.root);
          const written = await writeBrief(bundle.root, { bundle, pending });
          const full = await fs.readFile(written, "utf8");
          const human = (full.split("## 全量（机器可读）")[0] ?? "").trimEnd();
          return `${human}\n\n（全量已写入 .story/${bundle.id}/${LAYOUT.brief}）`;
        },
      }),
    ),
  );

  disposers.push(
    deps.fallbackCtx.tools.register(
      defineTool({
        name: "story_write",
        description:
          "同步记一拍（不碰正文）：推进时钟、回写 cursor 与时间流水、跑机械检查。正文留在上下文里，由回复输出。finalize=true 时把 text（整章正文）一次性写成 chapters/NN-title.md，并用 plant 登记本章新埋的伏笔。",
        parameters: {
          scene: { type: "string", description: "更新后的场景名（地点下面的一间屋子/一个角落）" },
          location: { type: "string", description: "更新后的地点名" },
          locationId: {
            type: "string",
            description: "地点的 id（world/locations.json 里的 id）；换地点时给，供场景归属校验",
          },
          lastBeat: { type: "string", description: "一句话概括这一拍（写进 cursor）" },
          chapter: { type: "number", description: "切到新章时给章号（从 0 起）" },
          chapterTitle: { type: "string", description: "切到新章时给章标题" },
          advanceMinutes: {
            type: "number",
            description: "这一拍推进多少分钟（0 表示不推进）；同时写 clock.now 与 advances",
          },
          advanceReason: { type: "string", description: "推进理由，写进 clock.advances" },
          finalize: { type: "boolean", description: "本章最后一拍：生成章节文件" },
          text: {
            type: "string",
            description:
              "这一拍的正文。它只写进 beats.jsonl（崩溃恢复用的 WAL），不进对话、不进上下文。",
          },
          participants: {
            type: "string",
            description: "这一拍在场的人物 id，逗号分隔（写进 WAL，供在场一致性检查）",
          },
          thread: { type: "string", description: "这一拍推进的故事线 id（如 TH02）" },
          affinity: {
            type: "string",
            description: "好感变动，逗号分隔：`mom:+3,teacher-zhou:-2`；原因用 advanceReason",
          },
          summary: {
            type: "string",
            description: "本章一句话摘要（60 字内），写进 chapters/index.json",
          },
          plant: {
            type: "string",
            description: "本章新埋的伏笔，一条一行：`label|cue` 或 `label|重|cue`",
          },
        },
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute(args: {
          scene?: string;
          location?: string;
          locationId?: string;
          lastBeat?: string;
          chapter?: number;
          chapterTitle?: string;
          advanceMinutes?: number;
          advanceReason?: string;
          finalize?: boolean;
          text?: string;
          plant?: string;
          participants?: string;
          thread?: string;
          affinity?: string;
          summary?: string;
        }) {
          const ws = workspace();
          const bundle = await loadBound(ws);
          const cursor = bundle.state.cursor;
          const lines: string[] = [];

          const chapterNo = typeof args.chapter === "number" ? args.chapter : cursor.chapter;
          if (chapterNo !== cursor.chapter && !(await briefIsFresh(bundle.root))) {
            return `开新章之前先读 brief：调用 story_open 刷新 .story/${bundle.id}/${LAYOUT.brief}，然后再写第 ${chapterNo} 章。`;
          }
          const title =
            args.chapterTitle?.trim() ||
            (cursor.chapter === chapterNo
              ? (cursor.chapterFile ?? "").replace(/\.md$/, "").replace(/^\d+-/, "") || "未命名"
              : "未命名");
          const file = `${pad(chapterNo)}-${slug(title)}.md`;

          // 时钟
          if (typeof args.advanceMinutes === "number" && args.advanceMinutes !== 0) {
            const from = bundle.clock.now;
            const to = shiftIso(from, args.advanceMinutes);
            bundle.clock.advances.push({
              from,
              to,
              minutes: args.advanceMinutes,
              reason: (args.advanceReason ?? args.lastBeat ?? "推进").replace(/\s+/g, " "),
            });
            bundle.clock.now = to;
            // 按日压缩：只保留最近 3 天的时间账，更早的折成一条写进 log/days.jsonl
            const dayOf = (iso: string): string => {
              const d = new Date(iso);
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            };
            const days = [...new Set(bundle.clock.advances.map((a) => dayOf(a.to)))].sort();
            if (days.length > 3) {
              const keepFrom = days[days.length - 3] ?? "";
              const dropped = bundle.clock.advances.filter((a) => dayOf(a.to) < keepFrom);
              if (dropped.length > 0) {
                const ledger = days
                  .filter((d) => d < keepFrom)
                  .map((date) => {
                    const items = dropped.filter((a) => dayOf(a.to) === date);
                    return {
                      date,
                      minutes: items.reduce((n, a) => n + a.minutes, 0),
                      from: items[0]?.from,
                      to: items[items.length - 1]?.to,
                      beats: items.length,
                      reasons: items.map((a) => a.reason),
                    };
                  });
                await fs.appendFile(
                  path.join(bundle.root, LAYOUT.log, "days.jsonl"),
                  ledger.map((l) => JSON.stringify(l)).join("\n") + "\n",
                  "utf8",
                );
                bundle.clock.advances = bundle.clock.advances.filter(
                  (a) => dayOf(a.to) >= keepFrom,
                );
              }
            }
            await writeJson(path.join(bundle.root, LAYOUT.clock), bundle.clock);
          }

          // WAL：这一拍的正文追加进 beats.jsonl，崩溃可恢复；不进上下文
          if (args.text?.trim()) {
            await fs.mkdir(path.join(bundle.root, LAYOUT.log), { recursive: true });
            await fs.appendFile(
              path.join(bundle.root, LAYOUT.log, "beats.jsonl"),
              `${JSON.stringify({
                t: bundle.clock.now,
                ch: chapterNo,
                scene: args.scene ?? cursor.scene,
                location: args.location ?? cursor.location,
                participants: (args.participants ?? "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                thread: args.thread ?? null,
                lastBeat: args.lastBeat ?? null,
                text: args.text.trim(),
              })}\n`,
              "utf8",
            );
          }

          // 好感结算：夹值、重算等级、写流水
          if (args.affinity?.trim()) {
            const entries = [];
            for (const part of args.affinity.split(",")) {
              const [who, raw] = part.split(":").map((s) => s.trim());
              const delta = Number(raw);
              if (!who || !Number.isFinite(delta)) continue;
              const current = bundle.state.affinity[who] ?? { value: 0, level: "中立" };
              const value = Math.max(-100, Math.min(100, current.value + delta));
              bundle.state.affinity[who] = { value, level: levelOf(value) };
              entries.push({
                npc: who,
                from: current.value,
                to: value,
                delta,
                reason: args.advanceReason ?? args.lastBeat ?? "",
              });
            }
            if (entries.length > 0) {
              await fs.appendFile(
                path.join(bundle.root, LAYOUT.log, "affinity.jsonl"),
                entries.map((e) => JSON.stringify({ ...e, t: bundle.clock.now })).join("\n") + "\n",
                "utf8",
              );
            }
          }
          cursor.chapter = chapterNo;
          cursor.chapterFile = file;
          if (args.scene) cursor.scene = args.scene;
          if (args.location) cursor.location = args.location;
          if (args.locationId) cursor.locationId = args.locationId;
          if (args.lastBeat) cursor.lastBeat = args.lastBeat;
          cursor.storyTime = bundle.clock.now;
          bundle.state.updatedAt = new Date().toISOString();
          await writeJson(path.join(bundle.root, LAYOUT.story), bundle.state);

          await fs.mkdir(path.join(bundle.root, LAYOUT.log), { recursive: true });
          await fs.appendFile(
            path.join(bundle.root, LAYOUT.log, "timeline.jsonl"),
            `${JSON.stringify({
              t: bundle.clock.now,
              ch: chapterNo,
              event: (args.lastBeat ?? "（未记）").replace(/\s+/g, " "),
            })}\n`,
            "utf8",
          );

          let generated = false;
          if (args.finalize) {
            let body = (args.text ?? "").trim();
            if (!body) {
              // 从 WAL 聚合这一章：崩溃后也能把章生成出来
              try {
                const wal = await fs.readFile(
                  path.join(bundle.root, LAYOUT.log, "beats.jsonl"),
                  "utf8",
                );
                const beatsOfChapter = wal
                  .split("\n")
                  .filter(Boolean)
                  .map((line) => {
                    try {
                      return JSON.parse(line) as { ch: number; text: string };
                    } catch {
                      return null;
                    }
                  })
                  .filter(
                    (b): b is { ch: number; text: string } => Boolean(b) && b!.ch === chapterNo,
                  )
                  .map((b) => b.text.trim())
                  .filter(Boolean);
                body = beatsOfChapter.join("\n\n---\n\n");
              } catch {
                /* 没有 WAL */
              }
            }
            if (!body) {
              lines.push(`第 ${chapterNo} 章 finalize 少了整章 text，章文件没生成。要补吗？`);
            } else {
              const target = path.join(bundle.root, LAYOUT.chapters, file);
              let existing = "";
              try {
                existing = (await fs.readFile(target, "utf8")).trimEnd();
              } catch {
                /* new chapter */
              }
              const written = existing
                ? `${existing}\n\n---\n\n${body}\n`
                : [
                    `# ${pad(chapterNo)} · ${title}`,
                    "",
                    `> 世界内时间：${bundle.clock.now}`,
                    ...(cursor.location ? [`> 地点：${cursor.location}`] : []),
                    "",
                    "---",
                    "",
                    body,
                    "",
                  ].join("\n");
              await writeText(target, written);
              generated = true;
              const indexFile = path.join(bundle.root, LAYOUT.chapters, "index.json");
              let index: unknown[] = [];
              try {
                index = JSON.parse(await fs.readFile(indexFile, "utf8")) as unknown[];
              } catch {
                index = [];
              }
              const kept = index.filter((e) => (e as { no?: number }).no !== chapterNo);
              kept.push({
                no: chapterNo,
                title,
                file,
                chars: body.replace(/\s/g, "").length,
                beats: body.split(/\n---\n/).length,
                storyTime: bundle.clock.now,
                participants: (args.participants ?? "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                thread: args.thread ?? null,
                summary: args.summary ?? "",
              });
              (kept as { no?: number }[]).sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
              await writeJson(indexFile, kept);
              lines.push(`本章生成：chapters/${file}（${body.replace(/\s/g, "").length} 字）`);
              for (const f of await plantForeshadows(bundle, args.plant)) {
                lines.push(`新埋入伏笔：${f.id} [${f.weight}] ${f.label} — ${f.cue}`);
              }
              // 章末落扩张基线：下一章拿它算新添了什么
              const totalNow = await finishedChars(bundle.root);
              const prevSnapshot = await loadSnapshot(bundle.root);
              await saveSnapshot(
                bundle.root,
                makeSnapshot(bundle, chapterNo, totalNow, prevSnapshot),
              );
              lines.push(
                `扩张基线已记：第 ${chapterNo} 章末，累计 ${totalNow} 字（人物 ${bundle.world.chars.length} / 地点 ${bundle.world.locations.length} / 子场景 ${bundle.world.sceneIds.size} / 线 ${bundle.world.threads.length}）`,
              );
            }
          }

          const chapters = await chaptersOf(bundle.root);
          const expansion = await expansionOf(bundle, chapterNo);
          const repaired = await autoRepair(bundle, chapters, expansion);
          if (repaired.fixed.length > 0) lines.push(`自动修正：${repaired.fixed.join("；")}`);

          const issues = repaired.remaining.filter(
            (issue) => generated || !(issue.code === "cursor/chapter" && issue.level === "error"),
          );
          await savePending(bundle.root, issues);
          // 漂移不进对话：留在 pending 与 brief，下一章开章时 autoRepair 再修
          await writeBrief(bundle.root, { bundle, pending: issues });
          return generated ? lines.join("\n") : "";
        },
      }),
    ),
  );

  disposers.push(
    deps.fallbackCtx.tools.register(
      defineTool({
        name: "story_check",
        description:
          "章末用一次：结构复查 + 写 brief，只回本章章节信息（章号 / 标题 / 字数 / 拍数）。漂移不进对话，写进 brief 与 pending，下一章开章时自动修。",
        parameters: {},
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute() {
          const ws = workspace();
          const bundle = await loadBound(ws);
          const chapters = await chaptersOf(bundle.root);
          const expansion = await expansionOf(bundle, bundle.state.cursor.chapter);
          const repaired = await autoRepair(bundle, chapters, expansion);
          const issues = repaired.remaining;
          await savePending(bundle.root, issues);
          const lines: string[] = [];

          // 章节信息：只回这一行
          const file = bundle.state.cursor.chapterFile;
          try {
            const body = await fs.readFile(path.join(bundle.root, LAYOUT.chapters, file), "utf8");
            const title =
              /^#\s*\d+\s*·\s*(.+)$/m.exec(body)?.[1]?.trim() ?? file.replace(/\.md$/, "");
            const chars = body.replace(/\s/g, "").length;
            const beats = body.split(/\n---\n/).length;
            const review = await reviewChapter(deps.fallbackCtx, bundle, body);
            await writeBrief(bundle.root, {
              bundle,
              pending: issues,
              chapterChars: chars,
              chapterBeats: beats,
              ...(review ? { review } : {}),
            });
            lines.push(`第 ${bundle.state.cursor.chapter} 章《${title}》`);
          } catch {
            await writeBrief(bundle.root, { bundle, pending: issues });
            lines.push(`第 ${bundle.state.cursor.chapter} 章 · ${file}（尚未生成）`);
          }
          return lines.join("\n");
        },
      }),
    ),
  );

  return {
    dispose(): void {
      for (const d of disposers.splice(0)) {
        try {
          d();
        } catch {
          /* already gone */
        }
      }
    },
    toolCount: () => 4,
  };
}
