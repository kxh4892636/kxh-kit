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
  readSession,
  readStory,
  storyRoot,
  writeSession,
  writeJson,
  writeText,
  type SessionBinding,
} from "./store.js";

export interface ToolDeps {
  /** Absolute workspace root — where `.story/` lives. */
  workspace: () => string;
  /** Plugin-root context, used when a call carries no agent-scoped context. */
  fallbackCtx: Ctx;
}

type Disposer = () => void;
interface Ctx {
  tools: { register: (def: unknown) => Disposer };
  systemPrompt: { section: (sec: unknown) => unknown };
  agents?: { get?: (id: string) => { ctx?: Ctx } | undefined };
}
interface Exec {
  agent?: unknown;
}

const text = (value: string) => [{ type: "text" as const, text: value }];

/** Session identity: the switch is per-conversation, never workspace-wide. */
function sessionKey(exec: Exec | undefined): string {
  const agent = exec?.agent as
    | { id?: string; sessionId?: string; session?: { id?: string } }
    | undefined;
  return String(agent?.sessionId ?? agent?.session?.id ?? agent?.id ?? "local");
}

function agentCtx(exec: Exec | undefined, fallback: Ctx): Ctx {
  const agent = exec?.agent as { ctx?: Ctx } | undefined;
  return agent?.ctx ?? fallback;
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

const OFF_HINT =
  "故事模式未开启（本会话）。用 story_mode action=on 绑定一个故事，或 action=new 新建。";

async function loadBound(workspace: string, key: string): Promise<StoryBundle> {
  const binding = await readSession(workspace, key);
  if (!binding.enabled || !binding.storyId) throw new Error(OFF_HINT);
  const bundle = await readStory(workspace, binding.storyId);
  if (!bundle) throw new Error(`绑定的故事目录损坏或不存在：.story/${binding.storyId}`);
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
 * Story mode runtime.
 *
 * Scope is the **session**, not the workspace:
 *  - binding lives in `.story/sessions/<key>.json`
 *  - the iron-rules section is registered on the calling agent's context, so it
 *    only reaches sessions that turned the mode on
 *  - tools stay registered (they are global by contract) but every body checks
 *    the calling session's binding first
 */
export function createRuntime(deps: ToolDeps) {
  const workspace = deps.workspace;
  const sections = new Map<string, Disposer>();

  const ensureSection = (exec: Exec | undefined, key: string): void => {
    if (sections.has(key)) return;
    const target = agentCtx(exec, deps.fallbackCtx);
    const d = target.systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text: IRON_RULES,
      interpolate: false,
    });
    if (typeof d === "function") sections.set(key, d as Disposer);
    else sections.set(key, () => {});
  };

  /** GUI path: no tool call, so resolve the agent by session id. */
  const ensureSectionFor = (session: string): void => {
    if (sections.has(session)) return;
    const agent = deps.fallbackCtx.agents?.get?.(session);
    const target = agent?.ctx ?? deps.fallbackCtx;
    const d = target.systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text: IRON_RULES,
      interpolate: false,
    });
    if (typeof d === "function") sections.set(session, d as Disposer);
    else sections.set(session, () => {});
  };

  const dropSection = (key: string): void => {
    const d = sections.get(key);
    if (!d) return;
    sections.delete(key);
    try {
      d();
    } catch {
      /* already gone */
    }
  };

  const unregisterTools: Disposer[] = [];

  unregisterTools.push(
    deps.fallbackCtx.tools.register(
      defineTool({
        name: "story_mode",
        description:
          "故事模式开关（按会话生效）。status 看本会话绑定；on 绑定已有故事并开启；off 关闭本会话；new 新建并开启。",
        parameters: {
          action: { type: "string", required: true, description: "status | on | off | new" },
          id: { type: "string", description: "on / new 时的故事目录名" },
          title: { type: "string", description: "new 时的故事标题" },
          rules: { type: "string", description: "new 时的 RULES.md 初始内容" },
        },
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute(
          args: { action: string; id?: string; title?: string; rules?: string },
          exec: Exec,
        ) {
          const ws = workspace();
          const key = sessionKey(exec);
          const action = args.action?.trim();
          const binding = await readSession(ws, key);

          const save = async (next: SessionBinding) => writeSession(ws, key, next);

          if (action === "status") {
            const ids = await listStories(ws);
            return [
              `故事模式：${binding.enabled ? "已开启" : "已关闭"}（本会话 ${key}）`,
              `绑定：${binding.storyId ?? "（无）"}`,
              ids.length
                ? `工作区故事：\n${ids.map((i) => `${i === binding.storyId ? "▶" : " "} ${i}`).join("\n")}`
                : "工作区故事：（还没有）",
            ].join("\n");
          }

          if (action === "off") {
            await save({ enabled: false, storyId: binding.storyId, updatedAt: "" });
            dropSection(key);
            return "本会话故事模式已关闭。文件都还在，重新 on 即可继续。";
          }

          if (action === "new") {
            if (!args.id || !args.title) return "new 需要 id 与 title。";
            const id = args.id.replace(/[\\/:*?"<>|]/g, "");
            const root = storyRoot(ws, id);
            if (!(await readStory(ws, id))) {
              for (const d of [LAYOUT.shards, LAYOUT.chapters, LAYOUT.log]) {
                await fs.mkdir(path.join(root, d), { recursive: true });
              }
              const now = new Date().toISOString();
              await writeJson(path.join(root, LAYOUT.state), {
                version: 1,
                story: args.title,
                updatedAt: now,
                cursor: {
                  chapter: 0,
                  chapterFile: "00-开篇.md",
                  scene: "开篇",
                  storyTime: now,
                  location: "",
                  lastBeat: "",
                },
                openThreads: [],
                affinity: {},
                meters: {},
              });
              await writeJson(path.join(root, LAYOUT.clock), { now, advances: [] });
              await writeJson(path.join(root, LAYOUT.beats), []);
              await writeJson(path.join(root, LAYOUT.foreshadows), []);
              await writeText(
                path.join(root, LAYOUT.entry),
                `# ${args.title}\n\n## 现在\n第 0 章 · 开篇\n\n## 去哪查\n- 规则 → [RULES.md](./RULES.md)\n- 世界 → [WORLD.md](./WORLD.md)\n- 人物 → [shards/chars-core.md](./${LAYOUT.shards}/chars-core.md)\n- 地点 → [shards/locations.md](./${LAYOUT.shards}/locations.md)\n- 线 → [shards/threads.md](./${LAYOUT.shards}/threads.md)\n\n## 悬置\n- \n`,
              );
              await writeText(
                path.join(root, LAYOUT.rules),
                args.rules ??
                  "# 故事规则（本故事特有）\n\n- 禁忌：\n- 称呼：\n- 节奏：慢写 亲密/对峙；跳过 通勤/上课\n",
              );
              await writeText(
                path.join(root, LAYOUT.world),
                `# 世界索引\n\n- [核心人物](./${LAYOUT.shards}/chars-core.md)\n- [次要人物](./${LAYOUT.shards}/chars-major.md)\n- [地点](./${LAYOUT.shards}/locations.md)\n- [故事线](./${LAYOUT.shards}/threads.md)\n- [大事记](./${LAYOUT.shards}/events.md)\n`,
              );
              for (const f of [
                "chars-core.md",
                "chars-major.md",
                "locations.md",
                "threads.md",
                "events.md",
              ]) {
                await writeText(path.join(root, LAYOUT.shards, f), `# ${f.replace(/\.md$/, "")}\n`);
              }
              await writeText(path.join(root, LAYOUT.chapters, "00-开篇.md"), "# 00 · 开篇\n");
            }
            await save({ enabled: true, storyId: id, updatedAt: "" });
            ensureSection(exec, key);
            return `已创建并开启：.story/${id}（本会话）\n调用 story_open 拿 Brief。`;
          }

          if (action === "on") {
            let id = args.id ?? binding.storyId ?? undefined;
            if (!id) {
              const ids = await listStories(ws);
              if (ids.length === 0) return "还没有故事。先 story_mode action=new。";
              if (ids.length > 1) return `有多个故事，请指定 id：${ids.join("、")}`;
              id = ids[0];
            }
            if (!id) return "还没有故事。先 story_mode action=new。";
            if (!(await readStory(ws, id))) return `没有这个故事：${id}`;
            await save({ enabled: true, storyId: id, updatedAt: "" });
            ensureSection(exec, key);
            return `本会话已开启故事模式：${id}\n调用 story_open 拿 Brief。`;
          }

          return "未知 action。可用：status | on | off | new";
        },
      }),
    ),
  );

  unregisterTools.push(
    deps.fallbackCtx.tools.register(
      defineTool({
        name: "story_open",
        description:
          "打开本会话绑定的故事，返回操作手册（此刻、上一拍、附近节点、悬置、伏笔、待修问题）。开工前必读。",
        parameters: {},
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute(_args: unknown, exec: Exec) {
          const ws = workspace();
          const bundle = await loadBound(ws, sessionKey(exec));
          const issues = guard({ bundle, chapters: await chaptersOf(bundle.root) });
          await savePending(bundle.root, issues);
          let rulesDigest = "";
          try {
            rulesDigest = digestRules(
              await fs.readFile(path.join(bundle.root, LAYOUT.rules), "utf8"),
            );
          } catch {
            /* no RULES.md yet */
          }
          return renderBrief(bundle, {
            pending: issues.filter((i) => i.level === "error"),
            rulesDigest,
          });
        },
      }),
    ),
  );

  unregisterTools.push(
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
        async execute(
          args: {
            text: string;
            scene?: string;
            location?: string;
            lastBeat?: string;
            chapter?: number;
            chapterTitle?: string;
          },
          exec: Exec,
        ) {
          const ws = workspace();
          const bundle = await loadBound(ws, sessionKey(exec));

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
          await writeJson(path.join(bundle.root, LAYOUT.state), bundle.state);

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
              `  读 .story/${bundle.id}/RULES.md、.story/${bundle.id}/shards/chars-core.md、chapters/${path.basename(target)}`,
              "  只报违规、不改稿：禁忌项（引原文为证）、称呼与口癖漂移、外人越权知情、结局基调偏离。",
              "  结构校验已经在刚才写入时跑过，不必重复。",
            );
          }
          return lines.join("\n");
        },
      }),
    ),
  );

  unregisterTools.push(
    deps.fallbackCtx.tools.register(
      defineTool({
        name: "story_check",
        description:
          "主动复查故事结构（章节连续、cursor、时钟单调、节点状态、伏笔与好感度）。结构校验已内建在 story_write 里，平时不必手动调用；本工具用于改完状态文件后主动复核，或拿一份语义检查工单。",
        parameters: {},
        output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
        async execute(_args: unknown, exec: Exec) {
          const ws = workspace();
          const bundle = await loadBound(ws, sessionKey(exec));
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
            `读这些文件：.story/${bundle.id}/RULES.md、.story/${bundle.id}/shards/chars-core.md、.story/${bundle.id}/chapters/ 下最近两章。`,
          );
          lines.push("逐条判：");
          lines.push("  1. 是否触犯 RULES.md 里的禁忌项（引用原文片段作为证据）");
          lines.push("  2. 人物语气是否漂移：称呼、自称、口癖是否与 chars-core.md 的样本一致");
          lines.push("  3. 是否出现「外人识破关系」类越权知情");
          lines.push("  4. 结局基调是否偏离已声明的方向");
          lines.push(
            "输出格式：{pass: boolean, violations: [{rule, evidence, location}], suggestion}",
          );
          if (rules.trim()) lines.push("", "本故事 RULES.md 摘要：", digestRules(rules));
          return lines.join("\n");
        },
      }),
    ),
  );

  return {
    /** Enable/disable a session's section from outside a tool call (GUI switch). */
    setSection(session: string, enabled: boolean): void {
      if (enabled) {
        ensureSectionFor(session);
      } else {
        dropSection(session);
      }
    },
    readBinding: (session: string) => readSession(workspace(), session),
    writeBinding: (session: string, next: SessionBinding) =>
      writeSession(workspace(), session, next),
    listStories: () => listStories(workspace()),
    /** Drop every session section on unload. */
    dispose(): void {
      for (const d of unregisterTools.splice(0)) {
        try {
          d();
        } catch {
          /* already gone */
        }
      }
      for (const key of sections.keys()) dropSection(key);
    },
    sessionCount: () => sections.size,
  };
}
