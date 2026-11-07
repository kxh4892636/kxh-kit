import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  groupWorktreeName,
  branchOfWorktree,
  ensureWorktree,
  installDependencies,
  mergeWorktree,
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

/** Windows 路径分隔符（用常量而非正则，避开转义坑）。 */
const SEP = "\\";

/** 在 worktree 里提交一个文件（合并类用例的前置）。 */
const commitIn = async (directory: string, name: string, body: string): Promise<string> => {
  await writeFile(join(directory, name), body, "utf8");
  await run("git", ["add", "."], { cwd: directory });
  await run("git", ["commit", "-qm", `add ${name}`], { cwd: directory });
  const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd: directory });
  return stdout.trim();
};

/** `git worktree list` 的原文（路径统一成 `/`）：验目录真的被回收 / 保留。 */
const worktreeList = async (root: string): Promise<string> => {
  const { stdout } = await run("git", ["worktree", "list"], { cwd: root });
  return stdout.replaceAll(SEP, "/");
};

/** 比对用的路径：Windows 的 `\` 与 git 输出的 `/` 要能对得上。 */
const slash = (path: string): string => path.replaceAll(SEP, "/");

describe("worktree 命名", () => {
  it("净化名字：拒绝路径分隔与空名", () => {
    expect(sanitizeWorktreeName("note-07")).toBe("note-07");
    expect(sanitizeWorktreeName(" a/b ")).toBe("a-b");
    expect(sanitizeWorktreeName("demo 侧边栏")).toBe("demo-侧边栏");
    expect(sanitizeWorktreeName("../escape")).toBe("escape");
    expect(() => sanitizeWorktreeName("   ")).toThrow(/名字无效/u);
    expect(() => sanitizeWorktreeName("///")).toThrow(/名字无效/u);
  });

  it("组键即现场名：单 note / 多 note / 无组（没有现场）", () => {
    expect(groupWorktreeName([])).toBeUndefined();
    expect(groupWorktreeName(["07"])).toBe("note-07");
    expect(groupWorktreeName(["08", "07", "08"])).toBe("grp-08-07");
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

describe("worktree 自动合并（真 git）", () => {
  it("可 ff-only：合并、回收目录与分支、主工作区拿到文件", async () => {
    const root = await tempRepo();
    const tree = await ensureWorktree({ workspace: root, name: "note-07" });
    const tip = await commitIn(tree.directory, "note.txt", "from worktree\n");
    expect(branchOfWorktree("note-07")).toBe(tree.branch);

    const merged = await mergeWorktree({ workspace: root, name: "note-07" });
    expect(merged.merged).toBe(true);
    expect(merged.commit).toBe(tip);
    expect(merged.branch).toBe("wt/note-07");
    expect(merged.cleanup ?? "").not.toBe("");
    // 主工作区拿到了文件。
    expect(existsSync(join(root, "note.txt"))).toBe(true);
    // 目录与分支都被回收，worktree 列表里不再有它。
    expect(existsSync(tree.directory)).toBe(false);
    expect(await worktreeList(root)).not.toContain(slash(tree.directory));
    const branches = await run("git", ["branch", "--list", "wt/note-07"], { cwd: root });
    expect(branches.stdout.trim()).toBe("");
  });

  it("不可 ff-only：不合并、不删目录与分支，现场保留", async () => {
    const root = await tempRepo();
    const tree = await ensureWorktree({ workspace: root, name: "note-08" });
    await commitIn(tree.directory, "from-wt.txt", "wt\n");
    // 主分支自己又往前走了：两边分叉，--ff-only 不能成立。
    await commitIn(root, "from-main.txt", "main\n");

    const merged = await mergeWorktree({ workspace: root, name: "note-08" });
    expect(merged.merged).toBe(false);
    expect(merged.reason ?? "").not.toBe("");
    expect(merged.directory).toBe(tree.directory);
    // 现场保留：目录、分支、worktree 列表都还在。
    expect(existsSync(tree.directory)).toBe(true);
    expect(await worktreeList(root)).toContain(slash(tree.directory));
    const branches = await run("git", ["branch", "--list", "wt/note-08"], { cwd: root });
    expect(branches.stdout.trim()).not.toBe("");
    // worktree 的改动没有进主工作区。
    expect(existsSync(join(root, "from-wt.txt"))).toBe(false);
  });

  it("并发合并不打架：串行化后两次都 ff-only 成功", async () => {
    const root = await tempRepo();
    const first = await ensureWorktree({ workspace: root, name: "grp-a" });
    await commitIn(first.directory, "a.txt", "a\n");
    // b 在 a 之上继续（模拟“两个 worker 串行交付”），这样串行化后第二个仍可 ff-only。
    const secondDirectory = join(root, WORKTREE_ROOT, "grp-b");
    await run("git", ["branch", branchOfWorktree("grp-b"), first.branch], { cwd: root });
    await run("git", ["worktree", "add", secondDirectory, branchOfWorktree("grp-b")], {
      cwd: root,
    });
    await commitIn(secondDirectory, "b.txt", "b\n");

    const [a, b] = await Promise.all([
      mergeWorktree({ workspace: root, name: "grp-a" }),
      mergeWorktree({ workspace: root, name: "grp-b" }),
    ]);
    expect(a.merged).toBe(true);
    expect(b.merged).toBe(true);
    // 主分支同时包含两边的文件，两个目录都回收了。
    expect(existsSync(join(root, "a.txt"))).toBe(true);
    expect(existsSync(join(root, "b.txt"))).toBe(true);
    expect(existsSync(first.directory)).toBe(false);
    expect(existsSync(secondDirectory)).toBe(false);
    expect(await worktreeList(root)).not.toContain(slash(first.directory));
  }, 30_000);
});
