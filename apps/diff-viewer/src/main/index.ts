// Electron 主进程入口: 无 HTTP server, renderer 的 /api/* 全部由 preload bridge
// 路由到本进程的 ApiRouter (见 api-router.ts)。
import { app, BrowserWindow } from "electron";
import { join } from "path";

import type { DiffSelection } from "../types/diff.js";
import { API_CHANNELS } from "../api-bridge/api-channels.js";

import { createApiRouter } from "./api-router.js";
import { GitDiffParser } from "./git-diff.js";
import { resolveInitialSelection } from "./initial-selection.js";
import { registerApiIpc, registerWorkspaceIpc } from "./ipc.js";
import { resolveRepoPath } from "./repo-path.js";

const bootstrap = async (): Promise<void> => {
  await app.whenReady();

  const repoPath = resolveRepoPath(process.argv, process.env, app.isPackaged);
  const parser = new GitDiffParser(repoPath);

  let initialSelection: DiffSelection;
  try {
    initialSelection = await resolveInitialSelection(parser);
  } catch (error) {
    // 目标路径不是 git 仓库时仍打开窗口, 由 UI 呈现 /api/diff 的错误信息
    console.error(`Failed to inspect repository at ${repoPath}:`, error);
    initialSelection = { baseCommitish: "HEAD", targetCommitish: "HEAD" };
  }

  let mainWindow: BrowserWindow | null = null;
  const router = createApiRouter({
    parser,
    repoPath,
    initialSelection,
    configPath: join(app.getPath("userData"), "config.json"),
    broadcast: (payload) => {
      mainWindow?.webContents.send(API_CHANNELS.watchEvent, payload);
    },
  });
  registerApiIpc(router);
  // 目录打开/嵌套仓库扫描 (issue 03); getWindow 延迟取值, 注册时窗口尚未创建
  registerWorkspaceIpc({ rootPath: repoPath, getWindow: () => mainWindow });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, "../../renderer/index.html"));
  }
};

app.on("window-all-closed", () => {
  // 单窗口工具应用, 全平台直接退出
  app.quit();
});

void bootstrap();
