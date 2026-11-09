import type { ToolkitToolInfo } from "../contract.js";

/** 客户端持有的工具目录快照：面板写入，撤回按钮读取。 */
interface ToolkitClientSnapshot {
  readonly tools: readonly ToolkitToolInfo[];
  readonly loaded: boolean;
}

let snapshot: ToolkitClientSnapshot = { tools: [], loaded: false };
const listeners = new Set<() => void>();

/**
 * 极小的外部 store：面板与按钮分处两个 slot，必须共享同一份开关状态。
 * 用 `useSyncExternalStore` 订阅，避免在 slot 之间传递 props。
 */
export const toolkitClientState = {
  getSnapshot(): ToolkitClientSnapshot {
    return snapshot;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  publish(tools: readonly ToolkitToolInfo[]): void {
    snapshot = { tools, loaded: true };
    for (const listener of Array.from(listeners)) listener();
  },
  /** 工具是否启用；目录尚未加载时按默认启用处理，避免按钮闪烁。 */
  isEnabled(id: string): boolean {
    return snapshot.tools.find((tool) => tool.id === id)?.enabled ?? true;
  },
  /** 复位（插件卸载或测试使用）。 */
  reset(): void {
    snapshot = { tools: [], loaded: false };
    for (const listener of Array.from(listeners)) listener();
  },
};
