import { test as base } from "@playwright/test";
import {
  killBackend,
  readBackendState,
  spawnBackend,
  waitForBackendHealthy,
  writeBackendState,
  type BackendState,
} from "./backend";

export interface BackendControl {
  state: BackendState;
  /** 停掉托管后端。 */
  stop: () => Promise<void>;
  /** 重新拉起托管后端并等待恢复健康;恢复后状态文件中的 PID 会更新。 */
  start: () => Promise<void>;
}

/**
 * S4 专用:停服/恢复能力。只有 globalSetup 自己拉起的后端(managed)才可被停起;
 * 测试独占后端，始终执行停服与恢复。
 */
export const test = base.extend<{ backend: BackendControl }>({
  backend: async ({ page: _page }, use): Promise<void> => {
    const state = readBackendState();
    if (!state) {
      throw new Error("缺少 e2e/.backend/state.json,globalSetup 可能未执行");
    }

    const stop = async (): Promise<void> => {
      if (state.mode !== "managed" || state.pid === undefined) {
        throw new Error("后端为外部管理,不支持停服");
      }
      await killBackend(state.pid);
      delete state.pid;
    };

    const start = async (): Promise<void> => {
      if (state.mode !== "managed" || state.entryPath === undefined) {
        throw new Error("后端为外部管理,不支持恢复");
      }
      const pid = spawnBackend(state.entryPath);
      state.pid = pid;
      writeBackendState(state);
      await waitForBackendHealthy(60_000);
    };

    await use({ state, stop, start });
  },
});

export { expect } from "@playwright/test";
