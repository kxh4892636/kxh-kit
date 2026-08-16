// 扫描器单测 (issue 03): 仓中仓父子层级、submodule (gitfile) 识别、重型目录跳过、
// .git 内部不进入、深度上限 8、进度事件序列。
// 扫描器只识别 .git 的存在与形态 (目录/文件), 不执行 git 命令,
// 因此夹具直接落盘目录结构, 不经 git spawn。
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, join, resolve } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ScanProgress } from "../../types/repository.js";

import { DEFAULT_MAX_DEPTH, scanForRepositories } from "./repo-scanner.js";

describe("repo-scanner", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "diff-viewer-scan-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // 目录形式的 .git → 普通仓库
  const makeRepo = async (relativePath: string): Promise<string> => {
    const dir = join(root, relativePath);
    await mkdir(dir, { recursive: true });
    await mkdir(join(dir, ".git"));
    return dir;
  };

  // 文件形式的 .git (gitfile) → submodule 检出形态
  const makeSubmodule = async (relativePath: string): Promise<string> => {
    const dir = join(root, relativePath);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, ".git"), "gitdir: ../.git/modules/sub\n", "utf8");
    return dir;
  };

  const makePlainDir = async (relativePath: string): Promise<void> => {
    await mkdir(join(root, relativePath), { recursive: true });
  };

  it("根目录本身不是仓库时, 发现的仓库平铺为顶层条目", async () => {
    await makeRepo("a");
    await makeRepo(join("b", "c"));

    const result = await scanForRepositories(root);

    expect(result.rootPath).toBe(resolve(root));
    expect(result.repositories.map((node) => node.name)).toEqual(["a", "c"]);
    expect(result.repositories[0]?.path).toBe(resolve(join(root, "a")));
    expect(result.repositories[1]?.path).toBe(resolve(join(root, "b", "c")));
    expect(result.repositories.every((node) => node.children.length === 0)).toBe(true);
  });

  it("根目录是仓库时仓中仓挂为父子条目", async () => {
    await makeRepo(".");
    await makeRepo(join("lib", "child"));

    const result = await scanForRepositories(root);

    expect(result.repositories).toHaveLength(1);
    const rootNode = result.repositories[0];
    expect(rootNode?.path).toBe(resolve(root));
    expect(rootNode?.children.map((node) => node.name)).toEqual(["child"]);
    expect(rootNode?.children[0]?.path).toBe(resolve(join(root, "lib", "child")));
  });

  it("发现仓库后继续向其内部递归, 支持多级嵌套", async () => {
    await makeRepo(".");
    await makeRepo("x");
    await makeRepo(join("x", "y"));

    const result = await scanForRepositories(root);

    const rootNode = result.repositories[0];
    const xNode = rootNode?.children[0];
    expect(rootNode?.name).toBe(basename(root));
    expect(xNode?.name).toBe("x");
    expect(xNode?.children.map((node) => node.name)).toEqual(["y"]);
  });

  it(".git 为文件 (gitfile) 时识别为 submodule 子仓库条目", async () => {
    await makeRepo(".");
    await makeSubmodule(join("vendor", "sub-lib"));

    const result = await scanForRepositories(root);

    const rootNode = result.repositories[0];
    const subNode = rootNode?.children[0];
    expect(rootNode?.isSubmodule).toBe(false);
    expect(subNode?.name).toBe("sub-lib");
    expect(subNode?.isSubmodule).toBe(true);
  });

  it("默认跳过 node_modules/dist 等重型目录, 不遍历其中仓库", async () => {
    await makeRepo(".");
    await makeRepo(join("node_modules", "heavy-dep"));
    await makeRepo(join("dist", "generated"));
    await makeRepo(join("packages", "real"));

    const progressEvents: ScanProgress[] = [];
    const result = await scanForRepositories(root, {}, (progress) => {
      progressEvents.push(progress);
    });

    const rootNode = result.repositories[0];
    expect(rootNode?.children.map((node) => node.name)).toEqual(["real"]);
    // 未遍历的直接证据: 进度事件从未落在被跳过的目录里
    const scannedPaths = progressEvents.map((event) => event.currentDirectory);
    expect(scannedPaths.some((path) => path.includes("node_modules"))).toBe(false);
    expect(scannedPaths.some((path) => path.includes("dist"))).toBe(false);
  });

  it("不进入 .git 内部 (submodule 的真实 gitdir 不会被重复计数)", async () => {
    await makeRepo(".");
    await makeRepo(join(".git", "modules", "inner"));

    const result = await scanForRepositories(root);

    expect(result.repositories).toHaveLength(1);
    expect(result.repositories[0]?.path).toBe(resolve(root));
    expect(result.scannedDirectories).toBe(1);
  });

  it("深度上限为 8: 第 8 层的仓库被发现, 第 9 层不再进入", async () => {
    expect(DEFAULT_MAX_DEPTH).toBe(8);
    const atDepth = (depth: number): string =>
      Array.from({ length: depth }, (_, index) => `d${index + 1}`).join("/");
    await makeRepo(atDepth(8));
    await makeRepo(atDepth(9));

    const result = await scanForRepositories(root);

    expect(result.repositories.map((node) => node.name)).toEqual(["d8"]);
    expect(result.repositories[0]?.path).toBe(resolve(join(root, atDepth(8))));
  });

  it("进度事件按扫描顺序逐目录发出, 计数单调递增", async () => {
    await makeRepo(".");
    await makeRepo("a");
    await makePlainDir("b");

    const progressEvents: ScanProgress[] = [];
    const result = await scanForRepositories(root, {}, (progress) => {
      progressEvents.push(progress);
    });

    // 根目录本身是仓库: 第一个事件即发现 1 个仓库
    expect(progressEvents[0]).toEqual({
      scannedDirectories: 1,
      foundRepositories: 1,
      currentDirectory: resolve(root),
    });
    // 逐目录一个事件, 计数单调
    expect(progressEvents).toHaveLength(result.scannedDirectories);
    progressEvents.forEach((event, index) => {
      expect(event.scannedDirectories).toBe(index + 1);
      if (index > 0) {
        expect(event.foundRepositories).toBeGreaterThanOrEqual(
          progressEvents[index - 1]?.foundRepositories ?? 0,
        );
      }
    });
    // 条目按名称排序遍历: root → a → b
    expect(progressEvents.map((event) => event.currentDirectory)).toEqual([
      resolve(root),
      resolve(join(root, "a")),
      resolve(join(root, "b")),
    ]);
    expect(progressEvents.at(-1)?.foundRepositories).toBe(2);
  });
});
