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

const git = (repoPath: string, args: string[]): string =>
  execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8" });

const writeAndCommit = async (
  repoPath: string,
  files: Record<string, string>,
  message: string,
): Promise<void> => {
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(join(repoPath, name), content, "utf8");
  }
  git(repoPath, ["add", "."]);
  git(repoPath, ["commit", "-m", message]);
};

export const createFixtureRepo = async (): Promise<FixtureRepo> => {
  const repoPath = await fs.mkdtemp(join(tmpdir(), "diff-viewer-fixture-"));

  git(repoPath, ["init", "-b", "main"]);
  git(repoPath, ["config", "user.email", "fixture@example.com"]);
  git(repoPath, ["config", "user.name", "Fixture"]);

  await writeAndCommit(repoPath, { "a.txt": "line one\nline two\nline three\n" }, "init a.txt");
  await writeAndCommit(
    repoPath,
    { "a.txt": "line one\nline two changed\nline three\n", "b.txt": "beta one\n" },
    "change a.txt, add b.txt",
  );
  await writeAndCommit(repoPath, { "b.txt": "beta one\nbeta two\n" }, "extend b.txt");

  // 分支上的提交供 branch 对比类测试使用
  git(repoPath, ["checkout", "-b", "feature"]);
  await writeAndCommit(repoPath, { "feature.txt": "feature work\n" }, "feature commit");
  git(repoPath, ["checkout", "main"]);

  return {
    repoPath,
    cleanup: async () => {
      await fs.rm(repoPath, { recursive: true, force: true });
    },
  };
};

// 在工作区制造未提交改动 (修改已跟踪文件)
export const makeWorkingTreeChange = async (repoPath: string): Promise<void> => {
  await fs.writeFile(join(repoPath, "a.txt"), "line one\nline two changed locally\nline three\n");
};
