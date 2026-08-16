// fake executor 的单元测试: 语义等价 double 的映射/git/扫描/cat 行为,
// 以及"经真实 remote-repo-scanner 解析回路"的闭环 (假输出必须骗得过真解析器)。
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createNestedRepoFixture,
  createFixtureRepo,
  makeWorkingTreeChange,
  type FixtureRepo,
  type NestedRepoFixture,
} from "../fixture-repo.js";
import { scanRemoteRepositories } from "../repo-scan/remote-repo-scanner.js";

import {
  createFakeSshExecutor,
  resolveFakeSshConfig,
  FAKE_SSH_ENV,
  FAKE_SSH_LOCAL_ENV,
  FAKE_SSH_REMOTE_ENV,
} from "./fake-ssh-executor.js";

describe("resolveFakeSshConfig", () => {
  it("未开启或缺映射时返回 null", () => {
    expect(resolveFakeSshConfig({})).toBeNull();
    expect(resolveFakeSshConfig({ [FAKE_SSH_ENV]: "1" })).toBeNull();
    expect(
      resolveFakeSshConfig({
        [FAKE_SSH_ENV]: "1",
        [FAKE_SSH_REMOTE_ENV]: "/remote/ws",
      }),
    ).toBeNull();
  });

  it("三变量齐备时给出单条映射", () => {
    expect(
      resolveFakeSshConfig({
        [FAKE_SSH_ENV]: "1",
        [FAKE_SSH_REMOTE_ENV]: "/remote/ws",
        [FAKE_SSH_LOCAL_ENV]: "D:\\fixture",
      }),
    ).toEqual({ pathMap: { "/remote/ws": "D:\\fixture" } });
  });
});

describe("fake-ssh-executor", () => {
  let fixture: FixtureRepo;

  beforeEach(async () => {
    fixture = await createFixtureRepo();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("git 命令映射远程 cwd 到本机目录执行, 输出原样带回", async () => {
    const fake = createFakeSshExecutor({ pathMap: { "/remote/ws": fixture.repoPath } });

    const result = await fake.exec("git", ["rev-parse", "--short", "HEAD"], {
      cwd: "/remote/ws",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{7}$/);

    const subdir = await fake.exec("git", ["rev-parse", "HEAD"], { cwd: "/remote/ws" });
    expect(subdir.exitCode).toBe(0);
  });

  it("git 非零退出 (真失败) 以 exitCode 带回, 与真实 executor 语义一致", async () => {
    const fake = createFakeSshExecutor({ pathMap: { "/remote/ws": fixture.repoPath } });

    const result = await fake.exec("git", ["rev-parse", "no-such-ref-xyz"], {
      cwd: "/remote/ws",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("cat 读映射后的本机文件 (blob working 场景)", async () => {
    const fake = createFakeSshExecutor({ pathMap: { "/remote/ws": fixture.repoPath } });

    const result = await fake.execBuffer("cat", ["/remote/ws/a.txt"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString("utf8")).toContain("line one");
  });

  it("未映射的远程路径抛错; 不支持的命令抛错", async () => {
    const fake = createFakeSshExecutor({ pathMap: { "/remote/ws": fixture.repoPath } });

    await expect(fake.exec("git", ["status"], { cwd: "/elsewhere" })).rejects.toThrow(
      /not mapped/i,
    );
    await expect(fake.exec("rm", ["-rf", "/"])).rejects.toThrow(/unsupported/i);
  });
});

describe("fake-ssh-executor 扫描回路", () => {
  let nested: NestedRepoFixture;

  beforeEach(async () => {
    nested = await createNestedRepoFixture();
  });

  afterEach(async () => {
    await nested.cleanup();
  });

  it("识别扫描脚本标记, 产出经真实 remote-repo-scanner 解析出等价仓库树", async () => {
    const fake = createFakeSshExecutor({ pathMap: { "/remote/ws": nested.rootPath } });
    const calls: string[] = [];
    const recording = {
      exec: (command: string, args: readonly string[], options?: { cwd?: string }) => {
        calls.push(args.join(" "));
        return fake.exec(command, args, options);
      },
      execBuffer: (
        command: string,
        args: readonly string[],
        options?: { cwd?: string; maxBuffer?: number },
      ) => fake.execBuffer(command, args, options),
    };

    const result = await scanRemoteRepositories(recording, {
      remotePath: "/remote/ws",
      keyBase: "ssh://fake-host",
    });

    // 走的是 sh -c 标记脚本通道
    expect(calls[0]).toMatch(/^-c # diff-viewer-scan-v1/);

    expect(result.rootPath).toBe("ssh://fake-host/remote/ws");
    const root = result.repositories[0];
    expect(root.path).toBe("ssh://fake-host/remote/ws");
    expect(root.name).toBe("ws");
    const childNames = root.children.map((child) => child.name).sort();
    expect(childNames).toEqual([nested.nestedName, nested.submoduleName]);
    expect(root.children.find((c) => c.name === nested.submoduleName)?.isSubmodule).toBe(true);
    // node_modules 内的仓库被跳过 (与本地扫描语义一致)
    const flat = JSON.stringify(result.repositories);
    expect(flat).not.toContain(nested.hiddenName);
    expect(result.scannedDirectories).toBeGreaterThan(0);
  });

  it("扫描输出中的根路径即远程前缀本身 (根为仓库)", async () => {
    const fake = createFakeSshExecutor({ pathMap: { "/remote/ws": nested.rootPath } });
    const result = await scanRemoteRepositories(fake, {
      remotePath: "/remote/ws",
      keyBase: "ssh://fake-host",
    });
    expect(result.repositories[0].path).toBe("ssh://fake-host/remote/ws");
  });
});

describe("fake-ssh-executor 与 RemoteGitDiffParser 组合", () => {
  it("经 fake 驱动的远程 parser 产出真实 diff (e2e 数据面同源验证)", async () => {
    const fixture = await createFixtureRepo();
    try {
      // 制造未提交改动 (a.txt HEAD 内容已是 "line two changed", 需用不同的改动文本)
      await makeWorkingTreeChange(fixture.repoPath);
      const fake = createFakeSshExecutor({ pathMap: { "/remote/ws": fixture.repoPath } });
      const { RemoteGitDiffParser } = await import("./remote-git-diff.js");
      const parser = new RemoteGitDiffParser(fake, "/remote/ws");

      const response = await parser.parseDiff({ baseCommitish: "HEAD", targetCommitish: "." });
      expect(response.files.map((file) => file.path)).toContain("a.txt");
      const aFile = response.files.find((file) => file.path === "a.txt");
      expect(
        aFile?.chunks[0]?.lines.some((line) => line.content === "line two changed locally"),
      ).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });
});
