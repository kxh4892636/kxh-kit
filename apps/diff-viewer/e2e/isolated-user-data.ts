// e2e 用户数据隔离: 每个用例经 DIFIT_USER_DATA_DIR 把整个 userData (config.json、
// 评论落盘、localStorage 等) 指到独立临时目录。应用会把 UI 偏好 (如 diff 布局)
// 持久化到 config/localStorage, 共享真实 userData 会让用例间互相污染 (05 曾把
// 布局切成 unified 导致 diff-render 的"默认 split"断言失败)。
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface IsolatedUserData {
  // 直接展开进 electron.launch 的 env
  env: Record<string, string>;
  // 评论落盘目录 (<userData>/comments/<repositoryId>.json), 供持久化断言
  commentsDir: string;
  cleanup: () => Promise<void>;
}

// ProcessEnv 的值可为 undefined, 与 electron.launch 的 env 类型不符, 过滤后展开
const processEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
};

export const createIsolatedUserData = async (): Promise<IsolatedUserData> => {
  const dir = await mkdtemp(join(tmpdir(), "diff-viewer-e2e-userdata-"));
  return {
    env: { ...processEnv(), DIFIT_USER_DATA_DIR: dir },
    commentsDir: join(dir, "comments"),
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
};
