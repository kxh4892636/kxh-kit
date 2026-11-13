import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

/**
 * 预设半与轮转的挂载诊断。
 *
 * 预设行挂载在宿主的 standing mount 作用域里，失败时宿主只记一条启动告警，会话照常可用——
 * 「没挂上」与「挂上了但没生效」在模型侧看起来一样。因此这里把每个阶段落到
 * `$DSH_HOME/toolkit/nano-flow-mount.json` 的 `stages` 里：没有文件=`apply` 根本没跑，
 * 只有 `apply`=`tools` / `systemPrompt` 一直没就位，`ready` 才是注册完成。
 */

/** 诊断文件名。 */
const MOUNT_REPORT_FILE = "nano-flow-mount.json";

/** 一次挂载的阶段：进入插件入口、进入预设半、注册完成、抛错，以及宿主侧的轮转挂载。 */
type MountStage = "entry" | "apply" | "ready" | "error" | "rotation";

/** 落盘的报告形状：同一进程内按阶段合并。 */
interface MountReport {
  readonly at: string;
  readonly pid: number;
  readonly stages: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

let enabled = true;

/** 测试里关掉落盘：诊断只面向真机。 */
export const disableMountReport = (): void => {
  enabled = false;
};

/** 已经写过的阶段，避免每次都重读文件。 */
let stages: Record<string, Record<string, unknown>> = {};

/**
 * 记录一次挂载阶段；同一进程内按阶段合并，任何失败都吞掉。
 * @param stage - 本次阶段。
 * @param detail - 该阶段的可观测事实。
 */
export const recordMount = (stage: MountStage, detail: Readonly<Record<string, unknown>>): void => {
  if (!enabled) return;
  try {
    const path = join(resolveDshHome(), "toolkit", MOUNT_REPORT_FILE);
    stages = { ...stages, [stage]: { ...detail } };
    mkdirSync(dirname(path), { recursive: true });
    const report: MountReport = {
      at: new Date().toISOString(),
      pid: process.pid,
      stages: { ...stages },
    };
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  } catch {
    // 诊断失败不影响挂载。
  }
};

/** 读回已落盘的阶段（同一进程复用）；跨进程重启时从文件恢复。 */
export const restoreMountReport = (): void => {
  if (!enabled) return;
  try {
    const path = join(resolveDshHome(), "toolkit", MOUNT_REPORT_FILE);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as MountReport;
    if (parsed.pid !== process.pid) {
      stages = {};
      return;
    }
    stages = { ...(parsed.stages as Record<string, Record<string, unknown>>) };
  } catch {
    stages = {};
  }
};
