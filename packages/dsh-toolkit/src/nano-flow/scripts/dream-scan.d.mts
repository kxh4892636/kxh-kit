/** dream-scan.mjs 的类型声明（脚本随包分发，扩展侧只读不改）。 */

export interface DreamTurn {
  readonly turn: number | null;
  readonly seq: readonly [number, number] | null;
  readonly startedAt: string;
  readonly user: string;
  readonly assistant: string;
  readonly tools: readonly string[];
}

export interface DreamSessionInput {
  readonly sessionId: string;
  readonly lastSeq: number;
  readonly latestSeq: number;
  readonly turns: readonly DreamTurn[];
}

export interface DreamPlanInput {
  readonly planPath: string;
  readonly sessions: readonly DreamSessionInput[];
}

export interface DreamIdlePlan {
  readonly planPath: string;
}

export interface DreamDomainInput {
  readonly domain: string;
  readonly plans: readonly DreamPlanInput[];
}

export interface DreamIdleDomain {
  readonly domain: string;
  readonly plans: readonly DreamIdlePlan[];
}

export interface DreamSessionCursor {
  readonly lastSeq: number;
  readonly updatedAt?: string;
}

export interface DreamPlanCursor {
  readonly sessions: Record<string, DreamSessionCursor>;
}

export interface DreamState {
  readonly version: number;
  readonly plans: Record<string, DreamPlanCursor>;
}

export interface DreamScanOptions {
  readonly rootDir?: string;
  readonly domainsPath?: string;
  readonly statePath?: string;
}

export interface DreamScanReport {
  readonly rootDir: string;
  readonly statePath: string;
  readonly state: DreamState;
  readonly domains: readonly DreamDomainInput[];
  readonly idle: readonly DreamIdleDomain[];
}

export interface DreamMark {
  readonly planPath: string;
  readonly sessionId: string;
  readonly seq: number;
}

export const scanDreamInput: (options?: DreamScanOptions) => DreamScanReport;

export const applyMarks: (statePath: string, marks: readonly DreamMark[]) => DreamState;

export const readState: (file: string) => DreamState;

export const defaultStatePath: () => string | undefined;

/** 把扫描结果渲染成给模型看的文本。 */
export const formatReport: (report: DreamScanReport) => string;
