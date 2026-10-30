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
    lines.push(`【先修 · ${pending.length} 条】`);
    for (const p of pending.slice(0, 6)) lines.push(`  ✖ [${p.code}] ${p.message}`);
    lines.push("  未清空之前不要写正文。");
  } else {
    lines.push("【检查】通过");
  }

  lines.push("");
  lines.push(
    "【下一步】写完正文调用 story_write；改过 state/clock/beats/foreshadows 后调用 story_check。",
  );
  lines.push("【别做】不要只把正文留在对话里；不要改检查规则来绕过检查。");

  return lines.join("\n");
}
