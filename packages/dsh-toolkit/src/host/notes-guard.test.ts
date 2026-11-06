import { describe, expect, it, vi } from "vite-plus/test";
import {
  installFsNotesGuard,
  installNotesGuard,
  isPlanNotesPath,
  NotesAccessDeniedError,
  notesToolGuard,
  type ToolCallLike,
} from "./notes-guard.js";

const PLAN_NOTES =
  "C:\\ws\\.agents\\domains\\dsh\\plans\\active\\2026-11-07-预设提示词评审\\notes.json";
const PLAN_SPEC =
  "C:\\ws\\.agents\\domains\\dsh\\plans\\active\\2026-11-07-预设提示词评审\\spec.md";
const OTHER_NOTES = "C:\\ws\\docs\\notes.json";
const OTHER_FILE = "C:\\ws\\packages\\dsh-toolkit\\src\\index.ts";

interface Target {
  readonly displayPath: string;
  readonly targetKey: string;
}

const target = (displayPath: string): Target => ({ displayPath, targetKey: `key:${displayPath}` });

/** 与真实后端同形：方法在原型上，`processPath` 给出执行世界里的绝对路径。 */
class FakeFs {
  readonly calls: string[] = [];
  readonly contents = new Map<string, string>([
    [PLAN_NOTES, '{"version":1,"notes":[]}'],
    [OTHER_NOTES, '{"other":true}'],
    [OTHER_FILE, "export const x = 1;"],
  ]);

  processPath(value: Target): string {
    return value.displayPath;
  }

  async readText(value: Target): Promise<string> {
    this.calls.push(`readText:${value.displayPath}`);
    return this.contents.get(value.displayPath) ?? "";
  }

  async streamText(value: Target): Promise<AsyncIterable<string>> {
    this.calls.push(`streamText:${value.displayPath}`);
    return (async function* (text: string) {
      yield text;
    })(this.contents.get(value.displayPath) ?? "");
  }

  async readBytes(value: Target): Promise<Uint8Array> {
    this.calls.push(`readBytes:${value.displayPath}`);
    return new TextEncoder().encode(this.contents.get(value.displayPath) ?? "");
  }

  async readByteRange(value: Target): Promise<Uint8Array> {
    this.calls.push(`readByteRange:${value.displayPath}`);
    return new Uint8Array();
  }

  async writeText(value: Target, content: string): Promise<{ operation: string }> {
    this.calls.push(`writeText:${value.displayPath}`);
    this.contents.set(value.displayPath, content);
    return { operation: "update" };
  }

  async editText(
    value: Target,
    edit: { readonly oldString: string; readonly newString: string; readonly replaceAll: boolean },
  ): Promise<{ version: string }> {
    this.calls.push(`editText:${value.displayPath}`);
    this.contents.set(value.displayPath, edit.newString);
    return { version: "v1" };
  }
}

const contextOf = (services: Record<string, unknown>) => ({
  get: (key: string): unknown => services[key],
  logger: { warn: vi.fn() },
});

const guardContext = (): {
  readonly guards: ((call: Readonly<ToolCallLike>) => string | undefined)[];
  readonly ctx: ReturnType<typeof contextOf>;
  readonly fs: FakeFs;
} => {
  const guards: ((call: Readonly<ToolCallLike>) => string | undefined)[] = [];
  const fs = new FakeFs();
  const ctx = contextOf({
    tools: {
      guard: (guard: (call: Readonly<ToolCallLike>) => string | undefined) => {
        guards.push(guard);
        return () => {
          const index = guards.indexOf(guard);
          if (index >= 0) guards.splice(index, 1);
        };
      },
    },
    fs,
  });
  return { guards, ctx, fs };
};

describe("isPlanNotesPath", () => {
  it("matches notes.json under a plans segment on either separator", () => {
    expect(isPlanNotesPath(PLAN_NOTES)).toBe(true);
    expect(isPlanNotesPath("/ws/.agents/domains/dsh/plans/reference/x/notes.json")).toBe(true);
    expect(isPlanNotesPath("C:\\ws\\plans\\archived\\X\\NOTES.JSON")).toBe(true);
    expect(isPlanNotesPath("plans/active/x/notes.json")).toBe(true);
  });

  it("leaves other files alone", () => {
    expect(isPlanNotesPath(PLAN_SPEC)).toBe(false);
    expect(isPlanNotesPath(OTHER_NOTES)).toBe(false);
    expect(isPlanNotesPath(OTHER_FILE)).toBe(false);
    expect(isPlanNotesPath("notes.json")).toBe(false);
    expect(isPlanNotesPath("")).toBe(false);
  });
});

describe("notesToolGuard", () => {
  it("lets nano_flow_* through", () => {
    expect(notesToolGuard({ name: "nano_flow_write", arguments: { op: "get" } })).toBeUndefined();
    expect(
      notesToolGuard({ name: "nano_flow_read", arguments: { path: PLAN_NOTES } }),
    ).toBeUndefined();
  });

  it("denies an fs tool that points at the Plan notes", () => {
    expect(notesToolGuard({ name: "read", arguments: { file_path: PLAN_NOTES } })).toContain(
      "nano_flow_read",
    );
    expect(notesToolGuard({ name: "edit", arguments: { file_path: PLAN_NOTES } })).toContain(
      "edit",
    );
  });

  it("denies a shell command that spells the path out", () => {
    expect(
      notesToolGuard({
        name: "pwsh",
        arguments: { command: `Get-Content '${PLAN_NOTES}'` },
      }),
    ).toContain("pwsh");
  });

  it("does not scan body text, patterns, sibling files or directories", () => {
    // 写文档时正文里出现路径不算引用。
    expect(
      notesToolGuard({ name: "write", arguments: { file_path: OTHER_FILE, content: PLAN_NOTES } }),
    ).toBeUndefined();
    // 搜代码里的 "notes.json" 是正常操作。
    expect(
      notesToolGuard({ name: "grep", arguments: { pattern: "notes.json", path: "src" } }),
    ).toBeUndefined();
    // 搜索根是 Plan 目录本身：泛搜属于已声明的旁路。
    expect(
      notesToolGuard({ name: "grep", arguments: { pattern: "x", path: "C:\\ws\\plans\\active" } }),
    ).toBeUndefined();
    // 同前缀的备份文件不是同一个文件。
    expect(
      notesToolGuard({ name: "pwsh", arguments: { command: `${PLAN_NOTES}.bak` } }),
    ).toBeUndefined();
    expect(notesToolGuard({ name: "read", arguments: { file_path: OTHER_NOTES } })).toBeUndefined();
    expect(notesToolGuard({ name: "read", arguments: "not-an-object" })).toBeUndefined();
  });
});

describe("installFsNotesGuard", () => {
  it("denies every content method on the Plan notes until disposed", async () => {
    const fs = new FakeFs();
    const dispose = installFsNotesGuard(fs);
    const notes = target(PLAN_NOTES);

    await expect(fs.readText(notes)).rejects.toBeInstanceOf(NotesAccessDeniedError);
    await expect(fs.streamText(notes)).rejects.toThrow("nano_flow_read");
    await expect(fs.readBytes(notes)).rejects.toBeInstanceOf(NotesAccessDeniedError);
    await expect(fs.readByteRange(notes)).rejects.toBeInstanceOf(NotesAccessDeniedError);
    await expect(fs.writeText(notes, "{}")).rejects.toBeInstanceOf(NotesAccessDeniedError);
    await expect(
      fs.editText(notes, { oldString: "a", newString: "b", replaceAll: false }),
    ).rejects.toBeInstanceOf(NotesAccessDeniedError);
    expect(fs.calls).toEqual([]);

    await expect(fs.readText(target(OTHER_NOTES))).resolves.toBe('{"other":true}');
    await expect(fs.readText(target(OTHER_FILE))).resolves.toBe("export const x = 1;");
    await expect(fs.writeText(target(OTHER_FILE), "changed")).resolves.toEqual({
      operation: "update",
    });

    dispose();
    expect(Object.hasOwn(fs, "readText")).toBe(false);
    await expect(fs.readText(notes)).resolves.toBe('{"version":1,"notes":[]}');
  });

  it("uses displayPath when the backend has no processPath", async () => {
    const fs = new FakeFs();
    (fs as unknown as { processPath?: unknown }).processPath = undefined;
    const dispose = installFsNotesGuard(fs);
    await expect(fs.readText(target(PLAN_NOTES))).rejects.toBeInstanceOf(NotesAccessDeniedError);
    dispose();
  });

  it("keeps a later override and ignores a missing service", async () => {
    const fs = new FakeFs();
    const dispose = installFsNotesGuard(fs);
    const later = async (): Promise<string> => "later";
    fs.readText = later;
    dispose();
    await expect(fs.readText(target(PLAN_NOTES))).resolves.toBe("later");

    expect(installFsNotesGuard(undefined)).toBeTypeOf("function");
    expect(() => installFsNotesGuard(undefined)()).not.toThrow();
  });
});

describe("installNotesGuard", () => {
  it("registers the tool guard and the fs wrapper, then lifts both", async () => {
    const { guards, ctx, fs } = guardContext();
    const dispose = installNotesGuard(ctx as never, ctx.logger);
    expect(guards).toHaveLength(1);
    expect(guards[0]?.({ name: "read", arguments: { file_path: PLAN_NOTES } })).toContain(
      "nano_flow_read",
    );
    await expect(fs.readText(target(PLAN_NOTES))).rejects.toBeInstanceOf(NotesAccessDeniedError);

    dispose();
    expect(guards).toEqual([]);
    await expect(fs.readText(target(PLAN_NOTES))).resolves.toBe('{"version":1,"notes":[]}');
  });

  it("warns and still closes the fs side when the tool registry is missing", () => {
    const ctx = contextOf({});
    const dispose = installNotesGuard(ctx as never, ctx.logger);
    expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining("fs 层收口"));
    dispose();
  });

  it("warns when the tool registry has no guard()", () => {
    const ctx = contextOf({ tools: {}, fs: new FakeFs() });
    installNotesGuard(ctx as never, ctx.logger);
    expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining("no guard()"));
  });
});
