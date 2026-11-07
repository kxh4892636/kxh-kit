/**
 * 首启迁移：把旧的“多通道运行态”并进事件账本。
 *
 * 旧版本把运行态分在三个地方：内存里的句柄表、`reports-pending.json`（没送达的 report）、
 * `interrupted.json`（崩溃凭据）。账本上线后这些都不再是真相，但**第一次启动**要能把它们
 * 读进来，否则升级前的悬空状态就凭空消失了。
 *
 * 做法：账本不存在（或为空）时生成一条初始 `snapshot`（notes 状态缓存 + 未读 report +
 * 崩溃凭据；重启时没有 live 会话，worker 表本来就是空的），然后把两个旧文件删掉。
 * `notes.json` 结构不动 —— Plan 业务真相继续在那里。
 * @module @kxh4892636/pi-toolkit/orchestrator/migrate
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { OrchestratorSettings } from "./config.ts";
import { clipText } from "./events.ts";
import { LEDGER_FILE, openLedger } from "./ledger.ts";
import { activePlans, listPlans } from "./plan.ts";
import {
  emptyState,
  snapshotState,
  type ProjectedReport,
  type ProjectionState,
} from "./projection.ts";
import { loadDocument } from "./store.ts";
import { REPORT_OUTCOMES, type ReportOutcome } from "./types.ts";

/** 旧的中断凭据文件名（迁移后删除）。 */
export const LEGACY_INTERRUPTED_FILE = "interrupted.json";
/** 旧的未送达通知队列文件名（迁移后删除）。 */
export const LEGACY_REPORTS_FILE = "reports-pending.json";

/** 迁移所需的上下文。 */
export interface MigrateOptions {
  /** 状态目录（`<agentDir>/orchestrator`）。 */
  readonly stateDir: string;
  /** 工作区根（找 Plan 用）。 */
  readonly workspace: string;
  /** 领域根（默认 `.agents/domains`）。 */
  readonly domainRoot: string;
  /** 读取 notes.json 的上限。 */
  readonly limits: OrchestratorSettings;
}

/** 迁移结果。 */
export interface MigrateOutcome {
  /** 真的写了初始 snapshot 返回 true。 */
  readonly migrated: boolean;
  /** 删掉的旧文件名。 */
  readonly removed: readonly string[];
  /** 迁进来的 note 状态条数。 */
  readonly notes: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJson = (file: string): unknown => {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
};

/** 旧 `interrupted.json` → 投影里的凭据。 */
const interruptedOf = (raw: unknown): ProjectionState["interrupted"] => {
  if (!isRecord(raw) || typeof raw["reason"] !== "string") return undefined;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return {
    at: typeof raw["at"] === "string" ? raw["at"] : "",
    reason: raw["reason"],
    plans: strings(raw["plans"]),
    notes: strings(raw["notes"]),
  };
};

/**
 * 旧 `reports-pending.json` → 未读 report。
 *
 * 旧队列的每条通知都带 `details`（就是当时的 `WorkerReport`），所以能如实还原；认不出来的
 * 条目直接跳过 —— 迁不进去比编造一条假 report 好。
 */
const reportsOf = (raw: unknown): ProjectedReport[] => {
  if (!isRecord(raw) || !Array.isArray(raw["notices"])) return [];
  const reports: ProjectedReport[] = [];
  for (const notice of raw["notices"]) {
    if (!isRecord(notice)) continue;
    const details = notice["details"];
    if (!isRecord(details)) continue;
    const note = details["note"];
    const outcome = details["outcome"];
    const summary = details["summary"];
    if (typeof note !== "string" || typeof outcome !== "string") continue;
    if (!(REPORT_OUTCOMES as readonly string[]).includes(outcome)) continue;
    const at = typeof notice["at"] === "number" ? new Date(notice["at"]).toISOString() : "";
    const evidence = Array.isArray(details["evidence"])
      ? details["evidence"].filter((item): item is string => typeof item === "string")
      : [];
    const planRef = typeof notice["planRef"] === "string" ? notice["planRef"] : undefined;
    reports.push({
      seq: reports.length + 1,
      at,
      worker: planRef ?? "",
      ...(planRef === undefined ? {} : { planRef }),
      note,
      outcome: outcome as ReportOutcome,
      summary: clipText(typeof summary === "string" ? summary : ""),
      ...(typeof details["question"] === "string"
        ? { question: clipText(details["question"]) }
        : {}),
      ...(evidence.length === 0 ? {} : { evidence }),
      read: false,
    });
  }
  return reports;
};

/**
 * 首启迁移。账本已有事件时原样返回（不重复迁移，也不删旧文件）。
 * @param options - 状态目录、工作区与上限。
 * @returns 迁移结果。
 */
export const migrateLedger = async (options: MigrateOptions): Promise<MigrateOutcome> => {
  const ledger = openLedger(options.stateDir);
  if (ledger.events().length > 0) return { migrated: false, removed: [], notes: 0 };

  const state = emptyState();
  let notes = 0;
  try {
    for (const plan of activePlans(await listPlans(options.workspace, options.domainRoot))) {
      let document;
      try {
        document = await loadDocument(plan.directory, options.limits);
      } catch {
        continue;
      }
      for (const note of document.notes) {
        state.notesStatus.set(`${plan.directory}::${note.id}`, {
          status: note.status,
          ...(note.needs === undefined ? {} : { needs: note.needs }),
          at: note.updated_at,
        });
        notes += 1;
      }
    }
  } catch {
    // 读不到 Plan 时只迁旧的运行态：迁移本身不该因为工作区形状而失败。
  }

  const legacyInterrupted = join(options.stateDir, LEGACY_INTERRUPTED_FILE);
  const legacyReports = join(options.stateDir, LEGACY_REPORTS_FILE);
  const interrupted = interruptedOf(readJson(legacyInterrupted));
  if (interrupted !== undefined) state.interrupted = interrupted;
  state.reports.push(...reportsOf(readJson(legacyReports)));

  ledger.append({
    type: "snapshot",
    payload: { upToSeq: 0, state: snapshotState(state) },
  });

  const removed: string[] = [];
  for (const [name, file] of [
    [LEGACY_INTERRUPTED_FILE, legacyInterrupted],
    [LEGACY_REPORTS_FILE, legacyReports],
  ] as const) {
    if (!existsSync(file)) continue;
    rmSync(file, { force: true });
    removed.push(name);
  }
  return { migrated: true, removed, notes };
};

/** 账本是否已经存在（哪怕只有一条 snapshot）。 */
export const ledgerExists = (stateDir: string): boolean => existsSync(join(stateDir, LEDGER_FILE));
