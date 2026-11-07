import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  autoWorktreeName,
  branchOfWorktree,
  ensureWorktree,
  installDependencies,
  removeWorktree,
  sanitizeWorktreeName,
  WORKTREE_ROOT,
} from "./worktree.ts";

const run = promisify(execFile);
const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** 一个真的 git 仓库（worktree 需要真 git）。 */
const tempRepo = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "pi-wt-"));
  created.push(root);
  await run("git", ["init", "-q", "-b", "main"], { cwd: root });
  await run("git", ["config", "user.email", "t@example.com"], { cwd: root });
  await run("git", ["config", "user.name", "t"], { cwd: root });
  await run("git", ["config", "commit.gpgsign", "false"], { cwd: root });
  await writeFile(join(root, "README.md"), "demo\n", "utf8");
  await run("git", ["add", "."], { cwd: root });
  await run("git", ["commit", "-qm", "init"], { cwd: root });
  return root;
};

describe("worktree 命名", () => {
  it("净化名字：拒绝路径分隔与空名", () => {
    expect(sanitizeWorktreeName("note-07")).toBe("note-07");
    expect(sanitizeWorktreeName(" a/b ")).toBe("a-b");
    expect(sanitizeWorktreeName("demo 侧边栏")).toBe("demo-侧边栏");
    expect(sanitizeWorktreeName("../escape")).toBe("escape");
    expect(() => sanitizeWorktreeName("   ")).toThrow(/名字无效/u);
    expect(() => sanitizeWorktreeName("///")).toThrow(/名字无效/u);
  });

  it("自动命名：单 note / 组 / Plan 级", () => {
    expect(autoWorktreeName([])).toBe("plan");
    expect(autoWorktreeName(["07"])).toBe("note-07");
    expect(autoWorktreeName(["07", "08"])).toBe("grp-07-08");
    expect(branchOfWorktree("note-07")).toBe("wt/note-07");
  });
});

describe("worktree 生命周期（真 git）", () => {
  it("新建 → 复用 → 回收（分支一起删）", async () => {
    const root = await tempRepo();
    const first = await ensureWorktree({ workspace: root, name: "note-07" });
    expect(first.created).toBe(true);
    expect(first.directory).toBe(join(root, WORKTREE_ROOT, "note-07"));
    expect(existsSync(join(first.directory, "README.md"))).toBe(true);
    // 在 worktree 里改文件不影响主工作区
    await writeFile(join(first.directory, "note.txt"), "隔离开的改动\n", "utf8");
    expect(existsSync(join(root, "note.txt"))).toBe(false);

    const again = await ensureWorktree({ workspace: root, name: "note-07" });
    expect(again.created).toBe(false);

    const removed = await removeWorktree({ workspace: root, name: "note-07" });
    expect(removed.removed).toBe(true);
    expect(removed.branchDeleted).toBe(true);
    expect(existsSync(first.directory)).toBe(false);
    const branches = await run("git", ["branch", "--list", "wt/note-07"], { cwd: root });
    expect(branches.stdout.trim()).toBe("");
  });

  it("worktree 的改动提交后可直接合并到主分支", async () => {
    const root = await tempRepo();
    const tree = await ensureWorktree({ workspace: root, name: "grp-01-02" });
    await writeFile(join(tree.directory, "note.txt"), "from worktree\n", "utf8");
    await run("git", ["add", "."], { cwd: tree.directory });
    await run("git", ["commit", "-qm", "wt change"], { cwd: tree.directory });
    await run("git", ["merge", "--ff-only", tree.branch], { cwd: root });
    expect(existsSync(join(root, "note.txt"))).toBe(true);
    const removed = await removeWorktree({ workspace: root, name: "grp-01-02" });
    expect(removed.removed).toBe(true);
  });

  it("安装失败会被报成 ok=false + 原因，不吞掉", async () => {
    // 引一个不存在的 workspace 包：pnpm 会立刻报 ERR_PNPM_WORKSPACE_PKG_NOT_FOUND（不联网）。
    const broken = await mkdtemp(join(tmpdir(), "pi-wt-broken-"));
    created.push(broken);
    await writeFile(
      join(broken, "package.json"),
      JSON.stringify({ name: "broken", dependencies: { "missing-dep-kxh": "workspace:*" } }),
      "utf8",
    );
    const outcome = await installDependencies(broken, 30_000);
    expect(outcome.ok).toBe(false);
    expect(outcome.command).toContain("pnpm install");
    expect(outcome.reason ?? "").not.toBe("");
  }, 60_000);
});
