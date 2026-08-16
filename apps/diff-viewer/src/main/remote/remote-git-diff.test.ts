import { describe, expect, it } from "vitest";

import type { CommandExecutor, ExecResult } from "./executor.js";
import { createDiffSelection } from "../../utils/diffSelection.js";

import { RemoteGitDiffParser } from "./remote-git-diff.js";

interface RecordedCall {
  command: string;
  args: readonly string[];
  cwd?: string;
}

interface StubRoute {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  buffer?: Buffer;
}

// 脚本化假 executor: 以 "git 参数 join" 为键返回预录响应; 未登记的命令返回
// exitCode 127 (check-attr 之类的容错路径会吞掉非零退出, rev-parse 等则会显式炸出)
const createGitStub = (routes: Record<string, StubRoute>) => {
  const calls: RecordedCall[] = [];
  const executor: CommandExecutor = {
    exec: (command, args, options) => {
      calls.push({ command, args, cwd: options?.cwd });
      const key = [command, ...args].join(" ");
      const route = routes[key];
      const result: ExecResult<string> = route
        ? {
            stdout: route.stdout ?? "",
            stderr: route.stderr ?? "",
            exitCode: route.exitCode ?? 0,
          }
        : { stdout: "", stderr: `unstubbed exec: ${key}`, exitCode: 127 };
      return Promise.resolve(result);
    },
    execBuffer: (command, args, options) => {
      calls.push({ command, args, cwd: options?.cwd });
      const key = [command, ...args].join(" ");
      const route = routes[key];
      const result: ExecResult<Buffer> = route
        ? {
            stdout: route.buffer ?? Buffer.from(route.stdout ?? "", "utf8"),
            stderr: route.stderr ?? "",
            exitCode: route.exitCode ?? 0,
          }
        : { stdout: Buffer.alloc(0), stderr: `unstubbed execBuffer: ${key}`, exitCode: 127 };
      return Promise.resolve(result);
    },
  };
  return { executor, calls };
};

const REMOTE = "/srv/work/repo";
const BASE_HASH = "1111111111111111111111111111111111111111";
const TARGET_HASH = "2222222222222222222222222222222222222222";

const SAMPLE_DIFF = [
  "diff --git a/a.txt b/a.txt",
  "index 1234567..89abcde 100644",
  "--- a/a.txt",
  "+++ b/a.txt",
  "@@ -1,2 +1,2 @@",
  " line one",
  "-line two",
  "+line two changed",
  "",
].join("\n");

describe("RemoteGitDiffParser.parseDiff", () => {
  it("任意两 commit 对比: rev-parse 两端后单次 git diff, 参数与本地产出一致", async () => {
    const { executor, calls } = createGitStub({
      "git rev-parse HEAD~1": { stdout: `${BASE_HASH}\n` },
      "git rev-parse HEAD": { stdout: `${TARGET_HASH}\n` },
      [`git diff ${BASE_HASH} ${TARGET_HASH} --no-ext-diff --color=never`]: { stdout: SAMPLE_DIFF },
    });
    const parser = new RemoteGitDiffParser(executor, REMOTE);

    const response = await parser.parseDiff(createDiffSelection("HEAD~1", "HEAD"));

    expect(response.files.map((file) => file.path)).toEqual(["a.txt"]);
    expect(response.files[0].chunks[0].lines.map((line) => line.type)).toEqual([
      "normal",
      "delete",
      "add",
    ]);
    expect(response.baseCommitish).toBe("1111111");
    expect(response.targetCommitish).toBe("2222222");
    expect(response.commit).toBe("1111111...2222222");
    // 所有 git 调用都落在远程仓库目录
    expect(calls.every((call) => call.command === "git" && call.cwd === REMOTE)).toBe(true);
  });

  it("未提交改动 (target .) 与 staged 的 diff 参数形态", async () => {
    const { executor, calls } = createGitStub({
      "git rev-parse HEAD": { stdout: `${BASE_HASH}\n` },
      [`git diff HEAD --no-ext-diff --color=never`]: { stdout: SAMPLE_DIFF },
      [`git diff --cached HEAD --no-ext-diff --color=never`]: { stdout: SAMPLE_DIFF },
    });
    const parser = new RemoteGitDiffParser(executor, REMOTE);

    const all = await parser.parseDiff(createDiffSelection("HEAD", "."));
    expect(all.targetCommitish).toBe(".");
    const staged = await parser.parseDiff(createDiffSelection("HEAD", "staged"));
    expect(staged.targetCommitish).toBe("staged");

    const diffCommands = calls
      .filter((call) => call.args[0] === "diff")
      .map((call) => call.args.join(" "));
    expect(diffCommands).toEqual([
      "diff HEAD --no-ext-diff --color=never",
      "diff --cached HEAD --no-ext-diff --color=never",
    ]);
  });

  it("merge-base 三点对比先解析汇合点; ignoreWhitespace/contextLines 透传", async () => {
    const { executor, calls } = createGitStub({
      "git merge-base feature origin/main": { stdout: `${BASE_HASH}\n` },
      "git rev-parse feature": { stdout: `${TARGET_HASH}\n` },
      [`git rev-parse ${BASE_HASH}`]: { stdout: `${BASE_HASH}\n` },
      [`git diff ${BASE_HASH} ${TARGET_HASH} -w -U5 --no-ext-diff --color=never`]: {
        stdout: SAMPLE_DIFF,
      },
    });
    const parser = new RemoteGitDiffParser(executor, REMOTE);

    await parser.parseDiff(createDiffSelection("origin/main", "feature", "merge-base"), true, 5);

    const diffCall = calls.find((call) => call.args[0] === "diff");
    expect(diffCall?.args).toContain("-w");
    expect(diffCall?.args).toContain("-U5");
  });

  it("非法 commitish 直接拒绝; git 失败时错误信息带对比上下文", async () => {
    const { executor } = createGitStub({});
    const parser = new RemoteGitDiffParser(executor, REMOTE);

    await expect(
      parser.parseDiff(createDiffSelection("HEAD;touch /tmp/pwned", "HEAD")),
    ).rejects.toThrow();

    await expect(parser.parseDiff(createDiffSelection("no-such", "HEAD"))).rejects.toThrow(
      /Failed to parse diff for HEAD vs no-such/,
    );
  });
});

describe("RemoteGitDiffParser blob/行数/generated", () => {
  it("getBlobContent: ref 经 rev-parse + cat-file 取二进制", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const { executor, calls } = createGitStub({
      "git rev-parse HEAD:img.png": { stdout: "abc123\n" },
      "git cat-file blob abc123": { buffer: bytes },
    });
    const parser = new RemoteGitDiffParser(executor, REMOTE);

    const content = await parser.getBlobContent("img.png", "HEAD");
    expect(content).toEqual(bytes);
    expect(calls.every((call) => call.cwd === REMOTE)).toBe(true);
  });

  it("getBlobContent: staged 走 git show :path; working 走远端 cat 绝对路径", async () => {
    const { executor, calls } = createGitStub({
      "git show :staged.txt": { buffer: Buffer.from("staged content\n") },
      [`cat ${REMOTE}/work.txt`]: { buffer: Buffer.from("working content\n") },
    });
    const parser = new RemoteGitDiffParser(executor, REMOTE);

    expect((await parser.getBlobContent("staged.txt", "staged")).toString("utf8")).toBe(
      "staged content\n",
    );
    expect((await parser.getBlobContent("work.txt", "working")).toString("utf8")).toBe(
      "working content\n",
    );
    const catCall = calls.find((call) => call.command === "cat");
    // cat 不经 cwd (cwd 语义是远程 shell 的, 绝对路径直接给出)
    expect(catCall?.args).toEqual([`${REMOTE}/work.txt`]);
  });

  it("getBlobContent: 路径穿越与绝对路径拒绝", async () => {
    const { executor, calls } = createGitStub({});
    const parser = new RemoteGitDiffParser(executor, REMOTE);

    await expect(parser.getBlobContent("../etc/passwd", "HEAD")).rejects.toThrow();
    await expect(parser.getBlobContent("/etc/passwd", "working")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("getLineCount 按换行字节计数 (末尾无换行也算一行)", async () => {
    const { executor } = createGitStub({
      "git rev-parse HEAD:a.txt": { stdout: "abc\n" },
      "git cat-file blob abc": { buffer: Buffer.from("l1\nl2\nl3") },
    });
    const parser = new RemoteGitDiffParser(executor, REMOTE);

    expect(await parser.getLineCount("a.txt", "HEAD")).toBe(3);
  });

  it("getGeneratedStatus: 路径规则命中不发命令; 否则查 blob 头部内容", async () => {
    const { executor, calls } = createGitStub({
      "git rev-parse HEAD:gen.txt": { stdout: "abc\n" },
      "git cat-file blob abc": {
        buffer: Buffer.from("// Generated by tool. DO NOT EDIT.\nrest\n"),
      },
    });
    const parser = new RemoteGitDiffParser(executor, REMOTE);

    const byPath = await parser.getGeneratedStatus("pnpm-lock.yaml", "HEAD");
    expect(byPath).toEqual({ isGenerated: true, source: "path" });

    const byContent = await parser.getGeneratedStatus("gen.txt", "HEAD");
    expect(byContent).toEqual({ isGenerated: true, source: "content" });
    expect(calls.some((call) => call.args.includes("pnpm-lock.yaml"))).toBe(false);
  });
});

describe("RemoteGitDiffParser 分支/提交表面", () => {
  it("getCurrentBranch: symbolic-ref 成功返回分支名, 非零 (detached) 返回 null", async () => {
    const attached = new RemoteGitDiffParser(
      createGitStub({ "git symbolic-ref --quiet --short HEAD": { stdout: "main\n" } }).executor,
      REMOTE,
    );
    expect(await attached.getCurrentBranch()).toBe("main");

    const detached = new RemoteGitDiffParser(
      createGitStub({
        "git symbolic-ref --quiet --short HEAD": { stderr: "fatal", exitCode: 1 },
      }).executor,
      REMOTE,
    );
    expect(await detached.getCurrentBranch()).toBeNull();
  });

  it("getOriginDefaultBranch: symref 优先, 其次 origin/main|master, 空则 null", async () => {
    const withSymref = new RemoteGitDiffParser(
      createGitStub({
        "git for-each-ref --format=%(refname:short)%09%(symref:short) refs/remotes": {
          stdout: "origin/main\t\norigin/HEAD\torigin/main\n",
        },
      }).executor,
      REMOTE,
    );
    expect(await withSymref.getOriginDefaultBranch()).toBe("origin/main");

    const noSymref = new RemoteGitDiffParser(
      createGitStub({
        "git for-each-ref --format=%(refname:short)%09%(symref:short) refs/remotes": {
          stdout: "origin/master\t\norigin/dev\t\n",
        },
      }).executor,
      REMOTE,
    );
    expect(await noSymref.getOriginDefaultBranch()).toBe("origin/master");

    const empty = new RemoteGitDiffParser(
      createGitStub({
        "git for-each-ref --format=%(refname:short)%09%(symref:short) refs/remotes": {
          stdout: "",
        },
      }).executor,
      REMOTE,
    );
    expect(await empty.getOriginDefaultBranch()).toBeNull();
  });

  it("resolveCommitish 截短 7 位并带 TTL 缓存", async () => {
    const { executor, calls } = createGitStub({
      "git rev-parse origin/main": { stdout: `${BASE_HASH}\n` },
    });
    const parser = new RemoteGitDiffParser(executor, REMOTE);

    expect(await parser.resolveCommitish("origin/main")).toBe("1111111");
    expect(await parser.resolveCommitish("origin/main")).toBe("1111111");
    expect(calls).toHaveLength(1);
  });

  it("getRevisionOptions: 分支 (默认分支优先, current 标记) 与 NUL 分隔提交列表", async () => {
    const { executor } = createGitStub({
      "git for-each-ref --format=%(refname:short)%09%(HEAD) refs/heads": {
        stdout: "feature\t*\nmain\t\n",
      },
      "git for-each-ref --format=%(refname:short)%09%(symref:short) refs/remotes": {
        stdout: "origin/main\t\norigin/HEAD\torigin/main\n",
      },
      "git log --max-count=20 --format=%H%x00%B%x00": {
        stdout: `${TARGET_HASH}\0feat: work\n\nbody line\0${BASE_HASH}\0init\0`,
      },
      "git symbolic-ref refs/remotes/origin/HEAD": {
        stdout: "refs/remotes/origin/main\n",
      },
      "git rev-parse HEAD~1": { stdout: `${BASE_HASH}\n` },
    });
    const parser = new RemoteGitDiffParser(executor, REMOTE);

    const options = await parser.getRevisionOptions("HEAD~1", "HEAD");

    expect(options.branches[0]).toEqual({ name: "main", current: false });
    expect(options.branches[1]).toEqual({ name: "feature", current: true });
    expect(options.commits).toEqual([
      { hash: TARGET_HASH, shortHash: "2222222", message: "feat: work\n\nbody line" },
      { hash: BASE_HASH, shortHash: "1111111", message: "init" },
    ]);
    expect(options.originDefaultBranch).toBe("origin/main");
    expect(options.resolvedBase).toBe("1111111");
  });
});

describe("RemoteGitDiffParser.normalizeRepositoryRelativePath (POSIX 规则)", () => {
  it("拒绝空/绝对/穿越; 反斜杠归一为正斜杠", () => {
    const parser = new RemoteGitDiffParser(createGitStub({}).executor, REMOTE);

    expect(parser.normalizeRepositoryRelativePath("a/b.txt")).toBe("a/b.txt");
    expect(parser.normalizeRepositoryRelativePath("a\\b.txt")).toBe("a/b.txt");
    expect(() => parser.normalizeRepositoryRelativePath("")).toThrow();
    expect(() => parser.normalizeRepositoryRelativePath("/abs")).toThrow();
    expect(() => parser.normalizeRepositoryRelativePath("a/../../x")).toThrow();
  });
});
