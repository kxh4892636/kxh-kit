import { promises as fs } from "node:fs";
import path from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { renderBrief } from "./brief.js";
import { guard, renderIssues } from "./guard.js";
import type { GuardIssue, StoryBundle } from "./model.js";
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

interface JobHandle {
  append: (text: string) => void;
  updateProgress?: (line: string) => void;
}

interface JobRegistry {
  start: (spec: {
    kind: string;
    label: string;
    owner?: string;
    run: (handle: JobHandle) => { cancel: () => void };
  }) => string;
}

interface Ctx {
  tools: { register: (def: unknown) => Disposer };
  systemPrompt: { section: (sec: unknown) => unknown };
  /** Optional: the dsh-jobs registry (`ctx.jobs`), present when a job controller is loaded. */
  jobs?: JobRegistry;
  get?: (name: string) => unknown;
}

const text = (value: string) => [{ type: "text" as const, text: value }];

/** Background bookkeeping: silent on success, only drift reaches the session. */
function jobRegistry(ctx: Ctx): JobRegistry | undefined {
  const viaGet = typeof ctx.get === "function" ? ctx.get("jobs") : undefined;
  return (ctx.jobs ?? (viaGet as JobRegistry | undefined)) || undefined;
}

/** The job's owner is the calling Session, when the execution context exposes it. */
function ownerOf(exec: unknown): string | undefined {
  const e = exec as Record<string, unknown> | undefined;
  if (!e) return undefined;
  const session = e["session"] as Record<string, unknown> | undefined;
  const agent = e["agent"] as Record<string, unknown> | undefined;
  const agentSession = agent?.["session"] as Record<string, unknown> | undefined;
  const candidates = [e["sessionId"], session?.["id"], agentSession?.["id"], agent?.["sessionId"]];
  for (const value of candidates) if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

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
        description: "打开绑定的故事，返回操作手册。开工前必读。不跑校验。",
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
          "后台记账（静默）：正文不进参数，直接写在回复里。本工具只把 cursor / 场景 / 时间流水写回，并在后台跑机械检查——只有漂移时才返回提醒。finalize=true 时把 text（整章正文）一次性写成 chapters/NN-title.md。",
        parameters: {
          text: {
            type: "string",
            description:
              "只在 finalize=true 时给：整章正文（Markdown，含拍间分隔），不带章标题。平时不传。",
          },
          scene: { type: "string", description: "更新后的场景名" },
          location: { type: "string", description: "更新后的地点" },
          lastBeat: { type: "string", description: "一句话概括这一拍（写进 cursor）" },
          chapter: { type: "number", description: "切到新章时给章号（从 0 起）" },
          chapterTitle: { type: "string", description: "切到新章时给章标题" },
          finalize: {
            type: "boolean",
            description: "本章最后一拍：设为 true，并用 text 给整章正文，一次生成章文件",
          },
        },
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute(
          args: {
            text?: string;
            scene?: string;
            location?: string;
            lastBeat?: string;
            chapter?: number;
            chapterTitle?: string;
            finalize?: boolean;
          },
          exec?: unknown,
        ) {
          const ws = workspace();
          const bundle = await loadBound(ws);
          const chapterNo =
            typeof args.chapter === "number" ? args.chapter : bundle.state.cursor.chapter;
          const title =
            args.chapterTitle?.trim() ||
            (bundle.state.cursor.chapter === chapterNo
              ? (bundle.state.cursor.chapterFile ?? "").replace(/\.md$/, "").replace(/^\d+-/, "") ||
                "未命名"
              : "未命名");

          const work = async (out: (line: string) => void): Promise<void> => {
            const cursor = bundle.state.cursor;
            const file = `${pad(chapterNo)}-${slug(title)}.md`;

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
                out(`第 ${chapterNo} 章 finalize 少了整章 text，章文件没生成。要补吗？`);
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
              }
            }

            const issues = guard({
              bundle,
              chapters: await chaptersOf(bundle.root),
              ...(generated ? {} : { unwrittenChapter: chapterNo }),
            });
            await savePending(bundle.root, issues);
            if (issues.length > 0) for (const line of driftReport(issues)) out(line);
          };

          const jobs = jobRegistry(deps.fallbackCtx);
          if (jobs) {
            const label = `第 ${chapterNo} 章 · ${args.finalize ? "章末生成" : (args.lastBeat ?? "记一拍")}`;
            try {
              jobs.start({
                kind: "story",
                label,
                ...(ownerOf(exec) ? { owner: ownerOf(exec)! } : {}),
                run: (handle) => {
                  void work((line) => handle.append(`${line}\n`)).catch((error) => {
                    handle.append(`后台记账失败：${String(error)}\n`);
                  });
                  return { cancel: () => {} };
                },
              });
              return "";
            } catch {
              /* 没有控制器可用时退回内联 */
            }
          }

          const buffered: string[] = [];
          try {
            await work((line) => buffered.push(line));
          } catch (error) {
            return `记账失败：${String(error)}`;
          }
          return buffered.join("\n");
        },
      }),
    ),
  );

  disposers.push(
    deps.fallbackCtx.tools.register(
      defineTool({
        name: "story_check",
        description:
          "章末用一次（后台，静默）：结构复查 + 语义自检清单。没有漂移就不出声；有漂移才返回提醒。语义自检在当前会话直接做，不委派 subagent。",
        parameters: {},
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute(_args: unknown, exec?: unknown) {
          const ws = workspace();
          const bundle = await loadBound(ws);

          const work = async (out: (line: string) => void): Promise<void> => {
            const issues = guard({ bundle, chapters: await chaptersOf(bundle.root) });
            await savePending(bundle.root, issues);
            if (issues.length > 0) for (const line of driftReport(issues)) out(line);
          };

          const jobs = jobRegistry(deps.fallbackCtx);
          if (jobs) {
            try {
              jobs.start({
                kind: "story",
                label: `第 ${bundle.state.cursor.chapter} 章 · 章末检查`,
                ...(ownerOf(exec) ? { owner: ownerOf(exec)! } : {}),
                run: (handle) => {
                  void work((line) => handle.append(`${line}\n`)).catch((error) => {
                    handle.append(`后台检查失败：${String(error)}\n`);
                  });
                  return { cancel: () => {} };
                },
              });
              return "";
            } catch {
              /* 退回内联 */
            }
          }

          const buffered: string[] = [];
          await work((line) => buffered.push(line));
          return buffered.length > 0 ? buffered.join("\n") : "结构检查通过。";
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

export { renderIssues };
