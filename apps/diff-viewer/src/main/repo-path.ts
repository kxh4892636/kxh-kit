// 解析启动参数中的目标仓库路径。
// dev 模式: electron . <repo>; 打包后: app <repo>; 也支持 --repo <path> 与
// DIFF_VIEWER_REPO 环境变量 (e2e 与脚本化启动用); 兜底为当前工作目录。
import { resolve } from "path";

export const resolveRepoPath = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  isPackaged: boolean,
): string => {
  const args = argv.slice(isPackaged ? 1 : 2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--repo") {
      const next = args[i + 1];
      if (next !== undefined) {
        return resolve(next);
      }
      continue;
    }
    if (arg.startsWith("-")) {
      continue;
    }
    return resolve(arg);
  }

  const envRepo = env.DIFF_VIEWER_REPO?.trim();
  if (envRepo) {
    return resolve(envRepo);
  }

  return process.cwd();
};
