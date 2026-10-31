import { promises as fs } from "node:fs";
import path from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { renderBrief } from "./brief.js";
import { autoRepair } from "./repair.js";
import { isDuplicate, nextId, parseSeeds } from "./foreshadow.js";
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
interface Ctx {
  tools: { register: (def: unknown) => Disposer };
  systemPrompt: { section: (sec: unknown) => unknown };
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

function driftReport(issues: GuardIssue[]): string[] {
  const errors = issues.filter((i) => i.level === "error").length;
  const lines = [`漂移：${errors} 错 / ${issues.length - errors} 警`];
  for (const issue of issues.slice(0, 8)) {
    lines.push(`[${issue.code}] ${issue.message}${issue.fix ? `（修：${issue.fix}）` : ""}`);
  }
  if (issues.length > 8) lines.push(`……另有 ${issues.length - 8} 条`);
  lines.push("要改吗？");
  return lines;
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

async function loadBound(workspace: string): Promise<StoryBundle> {
  const id = await readActive(workspace);
  if (!id) throw new Error(NO_STORY);
  const bundle = await readStory(workspace, id);
  if (!bundle) throw new Error(`绑定的故事目录损坏或不存在：.story/${id}`);
  return bundle;
}

function digestRules(markdown: string): string {
  return markdown
    .split("\n")
    .filter((l) => l.startsWith("- ") || /^\d+\.\s/.test(l) || l.startsWith("# "))
    .slice(0, 14)
    .join("\n");
}

/** 章末把这一章埋下的伏笔写进 foreshadows.json（埋哪几条由模型给）。 */
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
          let rulesDigest = "";
          try {
            rulesDigest = digestRules(
              await fs.readFile(path.join(bundle.root, LAYOUT.rules), "utf8"),
            );
          } catch {
            /* no rules.md yet */
          }
          return renderBrief(bundle, { pending, rulesDigest });
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
          scene: { type: "string", description: "更新后的场景名" },
          location: { type: "string", description: "更新后的地点" },
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
            description: "只在 finalize=true 时给：整章正文（Markdown，含拍间分隔），不带章标题",
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
          lastBeat?: string;
          chapter?: number;
          chapterTitle?: string;
          advanceMinutes?: number;
          advanceReason?: string;
          finalize?: boolean;
          text?: string;
          plant?: string;
        }) {
          const ws = workspace();
          const bundle = await loadBound(ws);
          const cursor = bundle.state.cursor;
          const lines: string[] = [];

          const chapterNo = typeof args.chapter === "number" ? args.chapter : cursor.chapter;
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
            await writeJson(path.join(bundle.root, LAYOUT.clock), bundle.clock);
          }

          cursor.chapter = chapterNo;
          cursor.chapterFile = file;
          if (args.scene) cursor.scene = args.scene;
          if (args.location) cursor.location = args.location;
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
            const body = (args.text ?? "").trim();
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
              lines.push(`本章生成：chapters/${file}（${body.length} 字）`);
              for (const f of await plantForeshadows(bundle, args.plant)) {
                lines.push(`新埋入伏笔：${f.id} [${f.weight}] ${f.label} — ${f.cue}`);
              }
            }
          }

          const chapters = await chaptersOf(bundle.root);
          const repaired = await autoRepair(bundle, chapters);
          if (repaired.fixed.length > 0) lines.push(`自动修正：${repaired.fixed.join("；")}`);

          const issues = repaired.remaining.filter(
            (issue) => generated || !(issue.code === "cursor/chapter" && issue.level === "error"),
          );
          await savePending(bundle.root, issues);
          if (issues.length > 0) lines.push(...driftReport(issues));

          return lines.join("\n");
        },
      }),
    ),
  );

  disposers.push(
    deps.fallbackCtx.tools.register(
      defineTool({
        name: "story_check",
        description:
          "章末用一次：结构复查，只回本章章节信息（章号 / 标题 / 字数 / 拍数）。有漂移时一并报出。",
        parameters: {},
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute() {
          const ws = workspace();
          const bundle = await loadBound(ws);
          const chapters = await chaptersOf(bundle.root);
          const repaired = await autoRepair(bundle, chapters);
          const issues = repaired.remaining;
          await savePending(bundle.root, issues);
          const lines: string[] = issues.length > 0 ? driftReport(issues) : [];
          if (repaired.fixed.length > 0) lines.push(`自动修正：${repaired.fixed.join("；")}`);

          // 章节信息：只回这一行
          const file = bundle.state.cursor.chapterFile;
          try {
            const body = await fs.readFile(path.join(bundle.root, LAYOUT.chapters, file), "utf8");
            const title =
              /^#\s*\d+\s*·\s*(.+)$/m.exec(body)?.[1]?.trim() ?? file.replace(/\.md$/, "");
            const chars = body.replace(/\s/g, "").length;
            const beats = body.split(/\n---\n/).length;
            lines.push(
              `第 ${bundle.state.cursor.chapter} 章《${title}》· ${file} · ${chars} 字 · ${beats} 拍`,
            );
          } catch {
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
