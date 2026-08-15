import { resolve } from "path";

import { describe, it, expect } from "vitest";

import { resolveRepoPath } from "./repo-path.js";

describe("resolveRepoPath", () => {
  it("dev 模式取第一个非 flag 位置参数", () => {
    expect(resolveRepoPath(["electron", ".", "my-repo"], {}, false)).toBe(resolve("my-repo"));
  });

  it("打包后跳过可执行文件路径取位置参数", () => {
    expect(resolveRepoPath(["/app/diff-viewer.exe", "my-repo"], {}, true)).toBe(resolve("my-repo"));
  });

  it("支持 --repo <path> 形式", () => {
    expect(resolveRepoPath(["electron", ".", "--repo", "other/repo"], {}, false)).toBe(
      resolve("other/repo"),
    );
  });

  it("跳过其他 flag 参数", () => {
    expect(resolveRepoPath(["electron", ".", "--inspect", "repo"], {}, false)).toBe(
      resolve("repo"),
    );
  });

  it("无位置参数时回落到 DIFF_VIEWER_REPO 环境变量", () => {
    expect(resolveRepoPath(["electron", "."], { DIFF_VIEWER_REPO: "env-repo" }, false)).toBe(
      resolve("env-repo"),
    );
  });

  it("都没有时兜底为当前工作目录", () => {
    expect(resolveRepoPath(["electron", "."], {}, false)).toBe(process.cwd());
  });
});
