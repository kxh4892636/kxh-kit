import { promises as fs } from "node:fs";
import path from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { renderBrief } from "./brief.js";
import { guard, hasErrors, renderIssues } from "./guard.js";
import type { GuardIssue, StoryBundle } from "./model.js";
import { IRON_RULES, SECTION_NAME, SECTION_ORDER } from "./prompt.js";
import {
  LAYOUT,
  listStories,
  nextChapterFile,
  readActive,
  readStory,
  writeActive,
  writeJson,
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
    .filter((l) => l.startsWith("- ") || /^\d+\.\s/.test(l) || l.startsWith("## "))
    .slice(0, 14)
    .join("\n");
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
          "打开绑定的故事，返回操作手册（此刻、上一拍、附近节点、悬置、伏笔、待修问题）。开工前必读。",
        parameters: {},
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute() {
          const ws = workspace();
          const bundle = await loadBound(ws);
          const issues = guard({ bundle, chapters: await chaptersOf(bundle.root) });
          await savePending(bundle.root, issues);
          let rulesDigest = "";
          try {
            rulesDigest = digestRules(
              await fs.readFile(path.join(bundle.root, LAYOUT.rules), "utf8"),
            );
          } catch {
            /* no rules.md yet */
          }
          return renderBrief(bundle, {
            pending: issues.filter((i) => i.level === "error"),
            rulesDigest,
          });
        },
      }),
    ),
  );

  disposers.push(
    deps.fallbackCtx.tools.register(
      defineTool({
        name: "story_write",
        description:
          "把一段正文落盘到当前章，并回写 cursor、追加流水、跑一致性校验。校验不通过会拒绝写入并返回问题清单。",
        parameters: {
          text: {
            type: "string",
            required: true,
            description: "本章正文段落（Markdown），不要带章标题",
          },
          scene: { type: "string", description: "更新后的场景名" },
          location: { type: "string", description: "更新后的地点" },
          lastBeat: { type: "string", description: "一句话概括这一拍（写进 cursor）" },
          chapter: { type: "number", description: "切到新章时给章号（从 0 起）" },
          chapterTitle: { type: "string", description: "切到新章时给章标题" },
        },
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute(args: {
          text: string;
          scene?: string;
          location?: string;
          lastBeat?: string;
          chapter?: number;
          chapterTitle?: string;
        }) {
          const ws = workspace();
          const bundle = await loadBound(ws);

          const pending = await pendingIssues(bundle.root);
          if (pending.length > 0) {
            return `拒绝写入：还有 ${pending.length} 条问题未修。\n${renderIssues(pending)}\n先修完再调用 story_write。`;
          }
          const before = guard({ bundle, chapters: await chaptersOf(bundle.root) });
          if (hasErrors(before)) {
            await savePending(bundle.root, before);
            return `拒绝写入：当前状态不一致，先修。\n${renderIssues(before)}`;
          }

          let chapterNo = bundle.state.cursor.chapter;
          let file = bundle.state.cursor.chapterFile;
          const openedChapter =
            typeof args.chapter === "number" && args.chapter !== bundle.state.cursor.chapter;
          if (typeof args.chapter === "number") {
            chapterNo = args.chapter;
            const title = (args.chapterTitle ?? "未命名").replace(/[\\/:*?"<>|\s]/g, "");
            file = `${String(chapterNo).padStart(2, "0")}-${title}.md`;
          }
          const target =
            file === bundle.state.cursor.chapterFile
              ? await nextChapterFile(ws, bundle.id, chapterNo)
              : path.join(bundle.root, LAYOUT.chapters, file);

          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.appendFile(target, `\n\n${args.text.trim()}\n`, "utf8");

          bundle.state.cursor.chapter = chapterNo;
          bundle.state.cursor.chapterFile = path.basename(target);
          if (args.scene) bundle.state.cursor.scene = args.scene;
          if (args.location) bundle.state.cursor.location = args.location;
          if (args.lastBeat) bundle.state.cursor.lastBeat = args.lastBeat;
          bundle.state.cursor.storyTime = bundle.clock.now;
          bundle.state.updatedAt = new Date().toISOString();
          await writeJson(path.join(bundle.root, LAYOUT.story), bundle.state);

          await fs.mkdir(path.join(bundle.root, LAYOUT.log), { recursive: true });
          const logLine = JSON.stringify({
            t: bundle.clock.now,
            ch: chapterNo,
            event: (args.lastBeat ?? args.text.slice(0, 40)).replace(/\s+/g, " "),
          });
          await fs.appendFile(
            path.join(bundle.root, LAYOUT.log, "timeline.jsonl"),
            `${logLine}\n`,
            "utf8",
          );

          const after = guard({ bundle, chapters: await chaptersOf(bundle.root) });
          await savePending(bundle.root, after);

          const lines = [`已落盘：${path.basename(target)}（${args.text.trim().length} 字）`];
          if (hasErrors(after)) lines.push("", "写入后出现新问题：", renderIssues(after));

          const openFs = bundle.foreshadows.filter((f) => f.status === "未触发");
          const pick = openFs[Math.floor(Math.random() * openFs.length)];
          if (pick && Math.random() < 0.35) {
            lines.push("", `〔可触发 · ${pick.id} ${pick.label}〕${pick.cue}`);
          }

          if (openedChapter) {
            lines.push(
              "",
              "── 语义检查（每章一次）──",
              `可以委派一个 subagent 审第 ${chapterNo} 章快照：`,
              `  读 .story/${bundle.id}/rules.md、.story/${bundle.id}/world/characters.md、chapters/${path.basename(target)}`,
              "  只报违规、不改稿：禁忌项（引原文为证）、称呼与口癖漂移、外人越权知情、结局基调偏离。",
              "  结构校验已经在刚才写入时跑过，不必重复。",
            );
          }
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
          "主动复查故事结构（章节连续、cursor、时钟单调、节点状态、伏笔与好感度）。结构校验已内建在 story_write 里；本工具用于改完状态文件后主动复核，或拿一份语义检查工单。",
        parameters: {},
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute() {
          const ws = workspace();
          const bundle = await loadBound(ws);
          const issues = guard({ bundle, chapters: await chaptersOf(bundle.root) });
          await savePending(bundle.root, issues);

          const lines: string[] = [];
          lines.push(
            issues.length === 0
              ? `结构检查通过 · 第 ${bundle.state.cursor.chapter} 章 · ${bundle.clock.now}`
              : `${issues.length} 条问题：\n${renderIssues(issues)}`,
          );

          const rules = await fs
            .readFile(path.join(bundle.root, LAYOUT.rules), "utf8")
            .catch(() => "");
          lines.push(
            "",
            "── 语义检查工单 ──",
            "本地校验只管结构。以下交派一个 subagent 执行（不污染本会话上下文）：",
            "",
          );
          lines.push("任务：以读者视角审最新章节，只报违规，不改稿。");
          lines.push(
            `读这些文件：.story/${bundle.id}/rules.md、.story/${bundle.id}/world/characters.md、.story/${bundle.id}/chapters/ 下最近两章。`,
          );
          lines.push("逐条判：");
          lines.push("  1. 是否触犯 rules.md 里的禁忌项（引用原文片段作为证据）");
          lines.push("  2. 人物语气是否漂移：称呼、自称、口癖是否与 characters.md 的样本一致");
          lines.push("  3. 是否出现「外人识破关系」类越权知情");
          lines.push("  4. 结局基调是否偏离已声明的方向");
          lines.push(
            "输出格式：{pass: boolean, violations: [{rule, evidence, location}], suggestion}",
          );
          if (rules.trim()) lines.push("", "本故事 rules.md 摘要：", digestRules(rules));
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
