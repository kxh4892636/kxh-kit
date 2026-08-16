import { describe, expect, it } from "vitest";

import type { CommandExecutor, ExecOptions, ExecResult } from "../remote/executor.js";
import type { ScanProgress } from "../../types/repository.js";

import { scanRemoteRepositories, SCAN_SCRIPT_MARKER } from "./remote-repo-scanner.js";

interface RecordedExec {
  command: string;
  args: readonly string[];
  options?: ExecOptions;
}

// 预录响应的假 executor: 记录调用, 返回给定脚本输出
const createStubExecutor = (response: ExecResult<string> | Error) => {
  const calls: RecordedExec[] = [];
  const executor: CommandExecutor = {
    exec: (command, args, options) => {
      calls.push({ command, args, options });
      if (response instanceof Error) {
        return Promise.reject(response);
      }
      return Promise.resolve(response);
    },
    execBuffer: () => Promise.reject(new Error("not implemented in stub")),
  };
  return { executor, calls };
};

const SAMPLE_OUTPUT = [
  "@@REPOS-DIR",
  "/srv/work/.git",
  "/srv/work/lib/nested-lib/.git",
  "@@REPOS-FILE",
  "/srv/work/vendor/sub-lib/.git",
  "@@DIRS-COUNT",
  "7",
  "",
].join("\n");

describe("remote-repo-scanner 脚本构造", () => {
  it("经 sh -c 执行带标记的 find 脚本; 根路径单引号包裹, 深度与跳过名进入谓词", async () => {
    const { executor, calls } = createStubExecutor({
      stdout: SAMPLE_OUTPUT,
      stderr: "",
      exitCode: 0,
    });
    await scanRemoteRepositories(executor, {
      remotePath: "/srv/work",
      keyBase: "ssh://git@example.com",
    });

    expect(calls).toHaveLength(1);
    const { command, args } = calls[0];
    expect(command).toBe("sh");
    expect(args[0]).toBe("-c");
    const script = args[1];
    expect(script).toContain(SCAN_SCRIPT_MARKER);
    expect(script).toContain("'/srv/work'");
    // maxDepth 默认 8 → .git 条目在 find 深度 9; 目录计数用深度 8
    expect(script).toContain("-maxdepth 9");
    expect(script).toContain("-maxdepth 8");
    expect(script).toContain("-name 'node_modules'");
    expect(script).toContain("-name '.turbo'");
    // .git 目录发现后 prune (不进入内部), gitfile 单独一节
    expect(script).toMatch(/-type d -name '?\.git'? -print/);
    expect(script).toMatch(/-type f -name '?\.git'? -print/);
  });

  it("maxDepth 选项覆盖默认值; 根路径含单引号时正确转义", async () => {
    const { executor, calls } = createStubExecutor({
      stdout: SAMPLE_OUTPUT,
      stderr: "",
      exitCode: 0,
    });
    await scanRemoteRepositories(executor, {
      remotePath: "/srv/it's",
      keyBase: "ssh://h",
      maxDepth: 2,
    });

    const script = calls[0].args[1];
    expect(script).toContain("-maxdepth 3");
    expect(script).toContain("/srv/it'\\''s");
  });
});

describe("remote-repo-scanner 输出解析", () => {
  it("目录/gitfile 两节解析为父子树, 节点路径为 ssh:// 会话键", async () => {
    const { executor } = createStubExecutor({ stdout: SAMPLE_OUTPUT, stderr: "", exitCode: 0 });
    const progress: ScanProgress[] = [];

    const result = await scanRemoteRepositories(
      executor,
      { remotePath: "/srv/work", keyBase: "ssh://git@example.com" },
      (p) => {
        progress.push(p);
      },
    );

    expect(result.rootPath).toBe("ssh://git@example.com/srv/work");
    expect(result.scannedDirectories).toBe(7);
    expect(result.repositories).toHaveLength(1);

    const root = result.repositories[0];
    expect(root).toMatchObject({
      path: "ssh://git@example.com/srv/work",
      name: "work",
      isSubmodule: false,
    });
    const names = root.children.map((child) => child.name).sort();
    expect(names).toEqual(["nested-lib", "sub-lib"]);
    const nested = root.children.find((child) => child.name === "nested-lib");
    const sub = root.children.find((child) => child.name === "sub-lib");
    expect(nested?.path).toBe("ssh://git@example.com/srv/work/lib/nested-lib");
    expect(nested?.isSubmodule).toBe(false);
    expect(sub?.path).toBe("ssh://git@example.com/srv/work/vendor/sub-lib");
    expect(sub?.isSubmodule).toBe(true);

    // 单次快照式进度 (远程 find 无逐目录回调)
    expect(progress).toEqual([
      { scannedDirectories: 7, foundRepositories: 3, currentDirectory: "/srv/work" },
    ]);
  });

  it("多层嵌套按最近祖先仓库挂接; 含空格路径解析正常", async () => {
    const output = [
      "@@REPOS-DIR",
      "/r/.git",
      "/r/a/.git",
      "/r/a/b/deep repo/.git",
      "@@REPOS-FILE",
      "@@DIRS-COUNT",
      "5",
    ].join("\n");
    const { executor } = createStubExecutor({ stdout: output, stderr: "", exitCode: 0 });

    const result = await scanRemoteRepositories(executor, {
      remotePath: "/r",
      keyBase: "ssh://h",
    });

    const root = result.repositories[0];
    const a = root.children[0];
    expect(a.path).toBe("ssh://h/r/a");
    expect(a.children[0]).toMatchObject({
      path: "ssh://h/r/a/b/deep repo",
      name: "deep repo",
    });
  });

  it("非零退出 (ssh 传输失败/远端 sh 报错) 抛错并带 stderr", async () => {
    const { executor } = createStubExecutor({
      stdout: "",
      stderr: "ssh: connect to host h port 22: Connection refused",
      exitCode: 255,
    });

    await expect(
      scanRemoteRepositories(executor, { remotePath: "/r", keyBase: "ssh://h" }),
    ).rejects.toThrow(/Connection refused/);
  });

  it("输出缺标记节 (远端 find 行为不符预期) 抛错", async () => {
    const { executor } = createStubExecutor({ stdout: "garbage", stderr: "", exitCode: 0 });

    await expect(
      scanRemoteRepositories(executor, { remotePath: "/r", keyBase: "ssh://h" }),
    ).rejects.toThrow(/scan output/i);
  });

  it("executor reject (本机 ssh 缺失) 原样传播", async () => {
    const { executor } = createStubExecutor(new Error("spawn ssh ENOENT"));

    await expect(
      scanRemoteRepositories(executor, { remotePath: "/r", keyBase: "ssh://h" }),
    ).rejects.toThrow("spawn ssh ENOENT");
  });
});
