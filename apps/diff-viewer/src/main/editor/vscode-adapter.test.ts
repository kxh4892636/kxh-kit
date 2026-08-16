import { describe, it, expect } from "vitest";

import { buildVscodeFileUrl, createVscodeEditorAdapter } from "./vscode-adapter.js";

describe("buildVscodeFileUrl", () => {
  it("POSIX 绝对路径带行号", () => {
    expect(buildVscodeFileUrl("/home/user/repo/a.ts", 12)).toBe(
      "vscode://file//home/user/repo/a.ts:12",
    );
  });

  it("Windows 绝对路径反斜杠归一为正斜杠", () => {
    expect(buildVscodeFileUrl("C:\\work\\repo\\a.ts", 3)).toBe("vscode://file/C:/work/repo/a.ts:3");
  });

  it("缺省行号只打开文件", () => {
    expect(buildVscodeFileUrl("/home/user/repo/a.ts")).toBe("vscode://file//home/user/repo/a.ts");
  });

  it("含空格与中文的路径原样保留 (协议 URL 由 OS 处理)", () => {
    expect(buildVscodeFileUrl("D:\\我的 项目\\repo\\a b.ts", 7)).toBe(
      "vscode://file/D:/我的 项目/repo/a b.ts:7",
    );
  });
});

describe("createVscodeEditorAdapter", () => {
  it("未注入 openExternal 时不可用, open 直接失败", async () => {
    const adapter = createVscodeEditorAdapter({});
    expect(adapter.id).toBe("vscode");
    expect(adapter.isAvailable()).toBe(false);
    const result = await adapter.open({ absolutePath: "/repo/a.ts", line: 1 });
    expect(result.ok).toBe(false);
  });

  it("open 构造协议 URL 并经 openExternal 打开", async () => {
    const opened: string[] = [];
    const adapter = createVscodeEditorAdapter({
      openExternal: async (url) => {
        opened.push(url);
      },
    });
    expect(adapter.isAvailable()).toBe(true);

    const result = await adapter.open({ absolutePath: "/repo/src/a.ts", line: 42 });
    expect(result).toEqual({ ok: true, url: "vscode://file//repo/src/a.ts:42" });
    expect(opened).toEqual(["vscode://file//repo/src/a.ts:42"]);
  });

  it("openExternal 抛错时返回失败并带错误信息", async () => {
    const adapter = createVscodeEditorAdapter({
      openExternal: async () => {
        throw new Error("no handler");
      },
    });
    const result = await adapter.open({ absolutePath: "/repo/a.ts" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Failed to open");
    }
  });
});
