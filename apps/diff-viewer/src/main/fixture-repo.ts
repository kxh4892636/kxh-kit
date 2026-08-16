// 测试用 git 仓库夹具: 在临时目录脚本化创建带多个 commit 与分支的仓库。
// 单元测试 (api-router/initial-selection) 与 Playwright e2e 共用。
import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";

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

export interface NestedRepoFixture {
  rootPath: string;
  rootName: string;
  nestedPath: string;
  nestedName: string;
  submodulePath: string;
  submoduleName: string;
  // node_modules 内的仓库, 扫描应跳过 (验收"未被遍历"的反例)
  hiddenInNodeModulesPath: string;
  hiddenName: string;
  cleanup: () => Promise<void>;
}

// issue 03 e2e 夹具: 根仓库 + 仓中仓 + submodule 形态仓库 + node_modules 内隐藏仓库。
// submodule 形态不经 git submodule add (本地路径 clone 走 file 传输, Windows 并行下
// MSYS2 fork 偶发崩溃), 而是落盘等价布局: 真实 gitdir 移到 .fixture-gitdirs/,
// 工作区 .git 写 gitfile 指回 —— 与 git submodule 检出后的磁盘形态一致,
// git 命令经 gitfile 解析照常在子目录工作。
export const createNestedRepoFixture = async (): Promise<NestedRepoFixture> => {
  const rootPath = await fs.mkdtemp(join(tmpdir(), "diff-viewer-nested-"));
  initRepo(rootPath, "main", false);
  await writeAndCommit(rootPath, { "a.txt": "root one\nroot two\n" }, "root init");
  // 根仓库未提交改动 → 默认对比 (无远程降级) 即展示 a.txt
  await fs.writeFile(join(rootPath, "a.txt"), "root one\nroot two changed\n");

  // 仓中仓: 真实 git 仓库
  const nestedPath = join(rootPath, "lib", "nested-lib");
  await fs.mkdir(nestedPath, { recursive: true });
  initRepo(nestedPath, "main", false);
  await writeAndCommit(nestedPath, { "nested.txt": "nested one\n" }, "nested init");
  await fs.writeFile(join(nestedPath, "nested.txt"), "nested one\nnested two\n");

  // submodule 形态: .git 文件 (gitfile) 指向旁边的真实 gitdir
  const submodulePath = join(rootPath, "vendor", "sub-lib");
  await fs.mkdir(submodulePath, { recursive: true });
  initRepo(submodulePath, "main", false);
  await writeAndCommit(submodulePath, { "submodule.txt": "sub one\n" }, "submodule init");
  const gitdirStorage = join(rootPath, ".fixture-gitdirs", "sub-lib");
  await fs.mkdir(join(rootPath, ".fixture-gitdirs"), { recursive: true });
  await fs.rename(join(submodulePath, ".git"), gitdirStorage);
  // gitfile 相对路径基于工作区目录解析, 正斜杠跨平台可用
  await fs.writeFile(join(submodulePath, ".git"), "gitdir: ../../.fixture-gitdirs/sub-lib\n");
  await fs.writeFile(join(submodulePath, "submodule.txt"), "sub one\nsub two\n");

  // node_modules 内的仓库: 扫描器必须跳过, 不得出现在仓库树
  const hiddenInNodeModulesPath = join(rootPath, "node_modules", "heavy-dep");
  await fs.mkdir(hiddenInNodeModulesPath, { recursive: true });
  initRepo(hiddenInNodeModulesPath, "main", false);
  await writeAndCommit(hiddenInNodeModulesPath, { "dep.txt": "dep\n" }, "dep init");

  return {
    rootPath,
    rootName: basename(rootPath),
    nestedPath,
    nestedName: basename(nestedPath),
    submodulePath,
    submoduleName: basename(submodulePath),
    hiddenInNodeModulesPath,
    hiddenName: basename(hiddenInNodeModulesPath),
    cleanup: async () => {
      await fs.rm(rootPath, { recursive: true, force: true });
    },
  };
};
