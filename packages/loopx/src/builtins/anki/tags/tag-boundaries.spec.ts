import { describe, expect, test } from "vitest";
import { JsonError } from "../errors";
import { invokeAnki, scriptedPort, type Invocation } from "../testing/test-harness";
import { changeTags, clearUnusedTags, listTags, replaceTag } from "./tag-operations";

const rejectingPort = (failure: unknown) =>
  scriptedPort(async (): Promise<never> => Promise.reject(failure), []);

describe("tag operation boundaries", (): void => {
  test("preserves a single note and trimmed tag in the CLI payload", async (): Promise<void> => {
    const result = await invokeAnki(
      ["tags", "add", "--note-id", "1", "--tag", "  x  "],
      (): null => null,
    );
    expect(result.code).toBe(0);
    expect(result.invocations).toEqual([{ action: "addTags", params: { notes: [1], tags: "x" } }]);
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      message: "Successfully added 1 tag(s) to 1 note(s)",
      notesAffected: 1,
      tagsAdded: ["x"],
    });
  });

  test("accepts exactly one thousand note IDs", async (): Promise<void> => {
    const argv = ["tags", "remove"];
    for (let id = 1; id <= 1000; id += 1) argv.push("--note-id", String(id));
    argv.push("--tag", "x");
    const result = await invokeAnki(argv, (): null => null);
    expect(result.code).toBe(0);
    expect(result.invocations[0]).toEqual({
      action: "removeTags",
      params: {
        notes: Array.from({ length: 1000 }, (_, index: number): number => index + 1),
        tags: "x",
      },
    });
  });

  test.each([
    ["0", "x", "--note-id requires one to one thousand positive integers"],
    ["1.5", "x", "--note-id requires one to one thousand positive integers"],
    ["1", "   ", "--tag requires one or more non-empty tags"],
  ])("rejects invalid tag change input %j", async (noteId, tag, error): Promise<void> => {
    const result = await invokeAnki(["tags", "add", "--note-id", noteId, "--tag", tag]);
    expect([result.code, result.invocations]).toEqual([2, []]);
    expect(JSON.parse(result.stderr).error).toBe(error);
  });

  test("rejects more than one thousand note IDs", async (): Promise<void> => {
    const argv = ["tags", "add"];
    for (let id = 1; id <= 1001; id += 1) argv.push("--note-id", String(id));
    argv.push("--tag", "x");
    const result = await invokeAnki(argv);
    expect([result.code, result.invocations]).toEqual([2, []]);
    expect(JSON.parse(result.stderr).error).toBe(
      "--note-id requires one to one thousand positive integers",
    );
  });

  test.each([
    ["a b", "c", "--from requires one tag"],
    ["a", "   ", "--to requires one tag"],
  ])("rejects non-single replacement tags", async (from, to, error): Promise<void> => {
    const result = await invokeAnki([
      "tags",
      "replace",
      "--note-id",
      "1",
      "--from",
      from,
      "--to",
      to,
    ]);
    expect([result.code, result.invocations]).toEqual([2, []]);
    expect(JSON.parse(result.stderr).error).toBe(error);
  });

  test.each([null, []])(
    "describes an empty unfiltered tag catalog",
    async (tags): Promise<void> => {
      await expect(listTags(scriptedPort((): unknown => tags, []))).resolves.toMatchObject({
        tags: [],
        total: 0,
        message: "No tags found in Anki collection",
      });
    },
  );

  test.each([undefined, ""])("does not filter for pattern %j", async (pattern): Promise<void> => {
    const result = await listTags(
      scriptedPort((): string[] => ["one"], []),
      pattern,
    );
    expect(result).toMatchObject({ tags: ["one"], message: "Found 1 tags" });
    expect(result).not.toHaveProperty("filtered");
  });

  test.each([new Error("offline"), "offline"])(
    "normalizes list failures",
    async (failure: unknown): Promise<void> => {
      await expect(listTags(rejectingPort(failure))).rejects.toMatchObject({ action: "getTags" });
    },
  );

  test("preserves structured list errors", async (): Promise<void> => {
    const error = new JsonError("structured", { action: "custom" });
    await expect(listTags(rejectingPort(error))).rejects.toBe(error);
  });
});

describe("tag operation boundaries", (): void => {
  test("reports add and remove output keys for normalized tag text", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    const port = scriptedPort((): null => null, invocations);
    await expect(
      changeTags(port, "addTags", { notes: [1], tags: ["  x  ", ""] }),
    ).resolves.toMatchObject({
      tagsAdded: ["x"],
      notesAffected: 1,
      message: expect.stringContaining("added"),
    });
    await expect(
      changeTags(port, "removeTags", { notes: [1, 2], tags: ["x y"] }),
    ).resolves.toMatchObject({
      tagsRemoved: ["x", "y"],
      notesAffected: 2,
      message: expect.stringContaining("from"),
    });
    expect(invocations).toEqual([
      { action: "addTags", params: { notes: [1], tags: "x" } },
      { action: "removeTags", params: { notes: [1, 2], tags: "x y" } },
    ]);
  });

  test("returns exact replace and cleanup results", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    const port = scriptedPort((): null => null, invocations);
    await expect(replaceTag(port, [1, 2], "old", "new")).resolves.toEqual({
      success: true,
      message: 'Successfully replaced "old" with "new" in 2 note(s)',
      notesAffected: 2,
      tagToReplace: "old",
      replaceWithTag: "new",
    });
    await expect(clearUnusedTags(port)).resolves.toEqual({
      success: true,
      message: "Successfully cleared unused tags from the collection",
    });
    expect(invocations).toEqual([
      {
        action: "replaceTags",
        params: { notes: [1, 2], tag_to_replace: "old", replace_with_tag: "new" },
      },
      { action: "clearUnusedTags", params: undefined },
    ]);
  });

  test.each([new Error("offline"), "offline"])(
    "normalizes change failures",
    async (failure: unknown): Promise<void> => {
      await expect(
        changeTags(rejectingPort(failure), "addTags", { notes: [1], tags: ["x"] }),
      ).rejects.toMatchObject({ action: "addTags" });
    },
  );

  test("preserves structured change errors", async (): Promise<void> => {
    const error = new JsonError("structured", { action: "custom" });
    await expect(
      changeTags(rejectingPort(error), "removeTags", { notes: [1], tags: ["x"] }),
    ).rejects.toBe(error);
  });

  test.each([
    [
      "replace",
      (failure: unknown): Promise<unknown> => replaceTag(rejectingPort(failure), [1], "a", "b"),
    ],
    ["clear", (failure: unknown): Promise<unknown> => clearUnusedTags(rejectingPort(failure))],
  ])("normalizes and preserves %s failures", async (_name, operation): Promise<void> => {
    await expect(operation("offline")).rejects.toBeInstanceOf(JsonError);
    const structured = new JsonError("structured", { action: "custom" });
    await expect(operation(structured)).rejects.toBe(structured);
  });
});
