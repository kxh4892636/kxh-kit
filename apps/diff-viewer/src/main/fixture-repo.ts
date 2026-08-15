// 测试用 git 仓库夹具: 在临时目录脚本化创建带多个 commit 与分支的仓库。
// 单元测试 (api-router/initial-selection) 与 Playwright e2e 共用。
import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface FixtureRepo {
  repoPath: string;
  cleanup: () => Promise<void>;
}

export interface FixtureRepoWithOrigin extends FixtureRepo {
  originPath: string;
}

export const runFixtureGit = (repoPath: string, args: string[]): string =>
  execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8" });

const writeAndCommit = async (
  repoPath: string,
  files: Record<string, string>,
  message: string,
): Promise<void> => {
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(join(repoPath, name), content, "utf8");
  }
  runFixtureGit(repoPath, ["add", "."]);
  runFixtureGit(repoPath, ["commit", "-m", message]);
};

const initRepo = (repoPath: string, defaultBranch: string, bare: boolean): void => {
  runFixtureGit(
    repoPath,
    bare ? ["init", "--bare", "-b", defaultBranch] : ["init", "-b", defaultBranch],
  );
  if (!bare) {
    runFixtureGit(repoPath, ["config", "user.email", "fixture@example.com"]);
    runFixtureGit(repoPath, ["config", "user.name", "Fixture"]);
  }
};

export const createFixtureRepo = async (): Promise<FixtureRepo> => {
  const repoPath = await fs.mkdtemp(join(tmpdir(), "diff-viewer-fixture-"));

  initRepo(repoPath, "main", false);

  await writeAndCommit(repoPath, { "a.txt": "line one\nline two\nline three\n" }, "init a.txt");
  await writeAndCommit(
    repoPath,
    { "a.txt": "line one\nline two changed\nline three\n", "b.txt": "beta one\n" },
    "change a.txt, add b.txt",
  );
  await writeAndCommit(repoPath, { "b.txt": "beta one\nbeta two\n" }, "extend b.txt");

  // 分支上的提交供 branch 对比类测试使用
  runFixtureGit(repoPath, ["checkout", "-b", "feature"]);
  await writeAndCommit(repoPath, { "feature.txt": "feature work\n" }, "feature commit");
  runFixtureGit(repoPath, ["checkout", "main"]);

  return {
    repoPath,
    cleanup: async () => {
      await fs.rm(repoPath, { recursive: true, force: true });
    },
  };
};

export interface FixtureRepoWithOriginOptions {
  // 默认分支名, 用于构造 origin 只有 master / 只有非常规分支等降级场景
  defaultBranch?: string;
  // 额外写入的 origin 远程跟踪分支 (指向默认分支 tip), 用于 origin/HEAD symref 优先级场景
  remoteBranches?: string[];
  // 设置 origin/HEAD symref 指向的分支 (git remote set-head)
  originHead?: string;
}

// 带 origin 远程的仓库: 默认分支在分叉 feature 后继续前进, 使三点 (merge-base) 与
// 两点对比结果不同 —— 三点只含 feature.txt, 两点还会带上默认分支对 a.txt 的反向改动。
// 结束后停留在 feature 分支。
export const createFixtureRepoWithOrigin = async (
  options: FixtureRepoWithOriginOptions = {},
): Promise<FixtureRepoWithOrigin> => {
  const defaultBranch = options.defaultBranch ?? "main";
  const originPath = await fs.mkdtemp(join(tmpdir(), "diff-viewer-origin-"));
  const repoPath = await fs.mkdtemp(join(tmpdir(), "diff-viewer-fixture-"));

  initRepo(originPath, defaultBranch, true);
  initRepo(repoPath, defaultBranch, false);

  await writeAndCommit(repoPath, { "a.txt": "line one\nline two\nline three\n" }, "init a.txt");
  runFixtureGit(repoPath, ["checkout", "-b", "feature"]);
  await writeAndCommit(repoPath, { "feature.txt": "feature work\n" }, "feature commit");
  runFixtureGit(repoPath, ["checkout", defaultBranch]);
  await writeAndCommit(
    repoPath,
    { "a.txt": "line one\nline two changed on default\nline three\n" },
    "change a.txt on default branch",
  );

  runFixtureGit(repoPath, ["remote", "add", "origin", originPath]);
  // 被测应用只读取 refs/remotes/* 从不 fetch/push, 远程跟踪引用直接本地写入:
  // push 本地路径要走 sh 传输, Windows 并行测试下 MSYS2 fork 会偶发崩溃 (Win32 error 487)
  runFixtureGit(repoPath, ["update-ref", `refs/remotes/origin/${defaultBranch}`, defaultBranch]);
  for (const branch of options.remoteBranches ?? []) {
    runFixtureGit(repoPath, ["branch", branch]);
    runFixtureGit(repoPath, ["update-ref", `refs/remotes/origin/${branch}`, branch]);
  }
  if (options.originHead) {
    runFixtureGit(repoPath, ["remote", "set-head", "origin", options.originHead]);
  }

  runFixtureGit(repoPath, ["checkout", "feature"]);

  return {
    repoPath,
    originPath,
    cleanup: async () => {
      await fs.rm(repoPath, { recursive: true, force: true });
      await fs.rm(originPath, { recursive: true, force: true });
    },
  };
};

// 在工作区制造未提交改动 (修改已跟踪文件)
export const makeWorkingTreeChange = async (repoPath: string): Promise<void> => {
  await fs.writeFile(join(repoPath, "a.txt"), "line one\nline two changed locally\nline three\n");
};
