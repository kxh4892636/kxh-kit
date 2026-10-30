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
  storyRoot,
  writeActive,
  writeJson,
  writeText,
} from "./store.js";

export interface ToolDeps {
  /** Absolute workspace root — where `.story/` lives. */
  workspace: () => string;
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

async function loadBound(workspace: string): Promise<StoryBundle> {
  const id = await readActive(workspace);
  if (!id)
    throw new Error("故事模式未开启。用 story_mode action=on 绑定一个故事，或 action=new 新建。");
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
 * Story mode runtime.
 *
 * Two states:
 *  - OFF: only `story_mode` is registered. No prompt section, no story tools —
 *         the plugin is effectively invisible.
 *  - ON:  `story_open` / `story_write` / `story_check` are registered and the
 *         iron-rules section is injected.
 *
 * `story_mode` itself always stays visible: without it there is no way to turn
 * the mode back on from inside a session.
 */
export function createRuntime(ctx: Ctx, deps: ToolDeps) {
  const workspace = deps.workspace;
  let disposers: Disposer[] = [];
  let sectionDispose: Disposer | undefined;
  let on = false;

  const registerStoryTools = (): void => {
    disposers.push(
      ctx.tools.register(
        defineTool({
          name: "story_open",
          description:
            "打开本会话绑定的故事，返回操作手册（此刻、上一拍、附近节点、悬置、伏笔、待修问题）。开工前必读。",
          parameters: {},
          output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
          async execute() {
            const bundle = await loadBound(workspace());
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

    disposers.push(
      ctx.tools.register(
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

            // Semantic review rides on the chapter boundary, not on every paragraph:
            // one subagent call per chapter instead of per scene.
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

    disposers.push(
      ctx.tools.register(
        defineTool({
          name: "story_check",
          description:
            "主动复查故事结构（章节连续、cursor、时钟单调、节点状态、伏笔与好感度）。注意：结构校验已内建在 story_write 里（写前写后各跑一次），平时不必手动调用；本工具用于改完状态文件后主动复核，或拿一份语义检查工单。",
          parameters: {},
          output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
          async execute() {
            const bundle = await loadBound(workspace());
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
            if (rules.trim()) lines.push("", `本故事 RULES.md 摘要：`, digestRules(rules));
            return lines.join("\n");
          },
        }),
      ),
    );
  };

  const enable = (): void => {
    if (on) return;
    on = true;
    const d = ctx.systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text: IRON_RULES,
      interpolate: false,
    });
    if (typeof d === "function") sectionDispose = d as Disposer;
    registerStoryTools();
  };

  const disable = (): void => {
    if (!on) return;
    on = false;
    for (const d of disposers.splice(0)) {
      try {
        d();
      } catch {
        /* already gone */
      }
    }
    if (sectionDispose) {
      try {
        sectionDispose();
      } catch {
        /* already gone */
      }
      sectionDispose = undefined;
    }
  };

  // Always-on switch. Kept outside `disposers` so OFF still leaves a way back.
  ctx.tools.register(
    defineTool({
      name: "story_mode",
      description:
        "故事模式开关。status 看状态；on 绑定已有故事并开启；off 关闭并撤下全部故事工具与规则；new 新建一个故事并开启。",
      parameters: {
        action: { type: "string", required: true, description: "status | on | off | new" },
        id: { type: "string", description: "on / new 时的故事目录名" },
        title: { type: "string", description: "new 时的故事标题" },
        rules: { type: "string", description: "new 时的 RULES.md 初始内容" },
      },
      output: { schema: { type: "string" }, render: (_a: unknown, v: string) => text(v) },
      async execute(args: { action: string; id?: string; title?: string; rules?: string }) {
        const ws = workspace();
        const action = args.action?.trim();

        if (action === "status") {
          const ids = await listStories(ws);
          const bound = await readActive(ws);
          const lines = [`故事模式：${on ? "已开启" : "已关闭"}`];
          lines.push(`绑定：${bound ?? "（无）"}`);
          lines.push(
            ids.length
              ? `故事：\n${ids.map((i) => `${i === bound ? "▶" : " "} ${i}`).join("\n")}`
              : "故事：（还没有）",
          );
          return lines.join("\n");
        }

        if (action === "off") {
          await fs.rm(path.join(ws, LAYOUT.dir, LAYOUT.active), { force: true }).catch(() => {});
          disable();
          return "故事模式已关闭。工具与规则已撤下，文件都还在，重新 on 即可继续。";
        }

        if (action === "new") {
          if (!args.id || !args.title) return "new 需要 id 与 title。";
          const id = args.id.replace(/[\\/:*?"<>|]/g, "");
          const root = storyRoot(ws, id);
          if (await readStory(ws, id)) {
            await writeActive(ws, id);
            enable();
            return `故事 ${id} 已存在，已绑定并开启。调用 story_open。`;
          }
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
          await writeActive(ws, id);
          enable();
          return `已创建并开启：.story/${id}\n调用 story_open 拿 Brief，然后 story_write 写第一段。`;
        }

        if (action === "on") {
          let id = args.id;
          if (!id) id = (await readActive(ws)) ?? undefined;
          if (!id) {
            const ids = await listStories(ws);
            if (ids.length === 0) return "还没有故事。先 story_mode action=new。";
            if (ids.length > 1) return `有多个故事，请指定 id：${ids.join("、")}`;
            id = ids[0];
          }
          if (!id) return "还没有故事。先 story_mode action=new。";
          if (!(await readStory(ws, id))) return `没有这个故事：${id}`;
          await writeActive(ws, id);
          enable();
          return `故事模式已开启：${id}\n调用 story_open 拿 Brief。`;
        }

        return "未知 action。可用：status | on | off | new";
      },
    }),
  );

  return {
    /** Called by the plugin after apply: reflect the on-disk ACTIVE pointer. */
    async syncFromDisk(): Promise<void> {
      const active = await readActive(workspace());
      if (active) enable();
      else disable();
    },
    enable,
    disable,
    isOn: () => on,
  };
}
