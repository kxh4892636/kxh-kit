import { upcoming } from "./guard.js";
import type { GuardIssue, StoryBundle } from "./model.js";

function fmt(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  const hh = String(t.getHours()).padStart(2, "0");
  const mi = String(t.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

export interface BriefOptions {
  pending?: GuardIssue[];
  /** Story-specific rules summary from RULES.md (first lines). Never the file body. */
  rulesDigest?: string;
}

/**
 * The operating manual handed to the model. Dynamic content only — the static
 * rules live in the system prompt, and must not be duplicated here.
 */
export function renderBrief(bundle: StoryBundle, opts: BriefOptions = {}): string {
  const { state, clock, beats, foreshadows } = bundle;
  const now = Date.parse(clock.now);
  const lines: string[] = [];

  lines.push(
    `【故事】${state.story} · 第 ${state.cursor.chapter} 章 · ${state.cursor.chapterFile}`,
  );
  lines.push(`【此刻】${fmt(clock.now)} · ${state.cursor.location} · ${state.cursor.scene}`);
  lines.push(`【上一拍】${state.cursor.lastBeat}`);

  const soon = upcoming(beats, now, 48);
  if (soon.length > 0) {
    lines.push("【48 小时内】");
    for (const b of soon) {
      const mark = b.status === "开窗" ? "▶ 可写" : "· 待开";
      lines.push(`  ${mark} ${b.id} ${b.title}  ${fmt(b.opensAt)} – ${fmt(b.expiresAt)}`);
    }
  }

  const openThreads = state.openThreads.filter(Boolean);
  if (openThreads.length > 0) {
    lines.push("【悬置】");
    for (const t of openThreads) lines.push(`  · ${t}`);
  }

  const openFs = foreshadows
    .filter((f) => f.status === "未触发")
    .sort((a, b) => "重中轻".indexOf(a.weight) - "重中轻".indexOf(b.weight));
  if (openFs.length > 0) {
    lines.push(`【伏笔 · 未触发 ${openFs.length} 条】`);
    for (const f of openFs.slice(0, 8)) lines.push(`  ${f.id} [${f.weight}] ${f.label} — ${f.cue}`);
    if (openFs.length > 8) lines.push(`  ……另有 ${openFs.length - 8} 条，读 foreshadows.json`);
  }

  const cast = bundle.world.chars.filter((c) => (c.hidden ?? []).length > 0);
  if (cast.length > 0) {
    lines.push(
      `【人设】${cast
        .map((c) => `${c.name} 未揭 ${(c.hidden ?? []).length}`)
        .join(" · ")}（一次只揭一条，揭了就搬进 revealed）`,
    );
  }
  const aff = Object.entries(state.affinity);
  if (aff.length > 0) {
    lines.push(`【好感】${aff.map(([n, a]) => `${n} ${a.value}（${a.level}）`).join(" · ")}`);
  }

  const meters = Object.entries(state.meters);
  if (meters.length > 0) {
    lines.push(`【量表】${meters.map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  }

  if (opts.rulesDigest && opts.rulesDigest.trim()) {
    lines.push("【本故事规则】");
    lines.push(opts.rulesDigest.trim());
  }

  const pending = opts.pending ?? [];
  if (pending.length > 0) {
    lines.push(`【待修 · ${pending.length} 条】`);
    for (const p of pending.slice(0, 6)) lines.push(`  ✖ [${p.code}] ${p.message}`);
  }

  lines.push("");
  lines.push(
    "【下一步】正文只留在上下文；每拍 story_write 记一笔；章末 finalize=true 一次生成章文件，再调一次 story_check。",
  );
  lines.push("【别做】不要把正文攒进工具参数；没到章末不要调 story_check。");

  return lines.join("\n");
}
