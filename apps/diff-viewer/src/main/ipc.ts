// 把纯函数路由 (api-router) 接到 Electron IPC: renderer 的 /api/* 请求经
// preload bridge 由 'api:request' 进入; watch 事件经 'api:watch:event' 推回。
// workspace:* 通道承载目录打开与嵌套仓库扫描 (issue 03): 目录对话框是
// Electron 原生能力, 扫描进度经 'workspace:scan-progress' 推送。
// ssh:* 通道承载 SSH 远程连接 (issue 06): 目标校验 + 远程扫描 + 历史落盘。
import type { BrowserWindow, OpenDialogOptions } from "electron";
import { dialog, ipcMain } from "electron";
import { isAbsolute } from "path";

import { API_CHANNELS } from "../api-bridge/api-channels.js";
import type { ApiBridgeRequest } from "../api-bridge/api-bridge-types.js";
import type { ScanProgress } from "../types/repository.js";

import type { ApiRouter } from "./api-router.js";
import { scanForRepositories } from "./repo-scan/repo-scanner.js";
import { scanRemoteRepositories } from "./repo-scan/remote-repo-scanner.js";
import type { CommandExecutor } from "./remote/executor.js";
import { createSshConnectionHistory } from "./remote/ssh-connection-history.js";
import {
  buildRemoteRepoKey,
  parseSshTarget,
  validateRemotePath,
  type SshTarget,
} from "./remote/ssh-target.js";

export const registerApiIpc = (router: ApiRouter): void => {
  ipcMain.handle(API_CHANNELS.request, (_event, request: ApiBridgeRequest) =>
    router.handle(request),
  );

  ipcMain.handle(API_CHANNELS.watchOpen, (event) => {
    // watch 通道建立后立即推送初始事件 (当前为 stub 的 connected 事件)
    for (const payload of router.getInitialWatchEvents()) {
      event.sender.send(API_CHANNELS.watchEvent, payload);
    }
    return true;
  });
};

export interface WorkspaceIpcOptions {
  // 启动时打开的目录 (resolveRepoPath 的结果)
  rootPath: string;
  getWindow: () => BrowserWindow | null;
}

// e2e 用: 夹具目录很小, 真实扫描瞬间完成, 无法断言"扫描期间有进度指示";
// 用每目录延迟把扫描拉长到可观测窗口。仅测试环境设置, 生产默认 0
const resolveScanDelayMs = (env: NodeJS.ProcessEnv): number => {
  const raw = env.DIFF_VIEWER_SCAN_DELAY_MS;
  if (raw === undefined) {
    return 0;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });

export const registerWorkspaceIpc = (options: WorkspaceIpcOptions): void => {
  ipcMain.handle(API_CHANNELS.workspaceGet, () => ({ rootPath: options.rootPath }));

  ipcMain.handle(API_CHANNELS.workspacePickDirectory, async () => {
    const owner = options.getWindow();
    const dialogOptions: OpenDialogOptions = { properties: ["openDirectory"] };
    const result = owner
      ? await dialog.showOpenDialog(owner, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(
    API_CHANNELS.workspaceScan,
    async (event, payload: { scanId?: unknown; rootPath?: unknown }) => {
      // IPC 边界数据不可信: 校验形状后再进入扫描器
      if (
        typeof payload?.scanId !== "string" ||
        typeof payload?.rootPath !== "string" ||
        !isAbsolute(payload.rootPath)
      ) {
        console.error("Invalid workspace scan payload:", payload);
        throw new Error("Invalid workspace scan payload");
      }
      const { scanId, rootPath } = payload;

      const scanDelayMs = resolveScanDelayMs(process.env);
      const forwardProgress = async (progress: ScanProgress): Promise<void> => {
        event.sender.send(API_CHANNELS.workspaceScanProgress, { scanId, progress });
        if (scanDelayMs > 0) {
          await sleep(scanDelayMs);
        }
      };

      try {
        return await scanForRepositories(rootPath, {}, forwardProgress);
      } catch (error) {
        console.error(`Failed to scan repositories under ${rootPath}:`, error);
        throw error;
      }
    },
  );
};

export interface SshIpcOptions {
  // 历史连接落盘路径 (userData/ssh-connections.json)
  historyFilePath: string;
  // 按解析后的目标构造 executor; e2e 时由 index.ts 替换为 fake executor
  createExecutor: (target: SshTarget) => CommandExecutor;
}

// SSH 远程连接 (issue 06): 'ssh:connect' = 校验 → 远程扫描 → 历史落盘;
// 'ssh:list-history' = 读取历史列表。校验/连接/扫描失败均抛回 renderer (message 可展示)
export const registerSshIpc = (options: SshIpcOptions): void => {
  const history = createSshConnectionHistory({ filePath: options.historyFilePath });

  ipcMain.handle(
    API_CHANNELS.sshConnect,
    async (_event, payload: { target?: unknown; path?: unknown }) => {
      // IPC 边界数据不可信: 校验形状后再进入目标/路径校验
      if (typeof payload?.target !== "string" || typeof payload?.path !== "string") {
        console.error("Invalid ssh connect payload:", payload);
        throw new Error("Invalid ssh connect payload");
      }

      let target: SshTarget;
      let remotePath: string;
      try {
        target = parseSshTarget(payload.target);
        remotePath = validateRemotePath(payload.path);
      } catch (error) {
        console.error("Invalid ssh connect target/path:", error);
        throw error;
      }

      try {
        const result = await scanRemoteRepositories(options.createExecutor(target), {
          remotePath,
          keyBase: buildRemoteRepoKey(target, ""),
        });
        // 历史记用户输入的原始 target (别名可读性), 落盘失败不拖垮连接结果
        await history.record(payload.target, remotePath);
        return result;
      } catch (error) {
        console.error(`Failed to connect ssh target ${payload.target} path ${remotePath}:`, error);
        throw error;
      }
    },
  );

  ipcMain.handle(API_CHANNELS.sshHistory, () => history.load());
};
