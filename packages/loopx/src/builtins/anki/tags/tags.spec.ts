import { describe, expect, test } from "vitest";
import { invokeAnki } from "../testing/test-harness";

describe("loopx anki tags", (): void => {
  test.each([
    ["tags", "--help"],
    ["tags", "list", "--help"],
    ["tags", "add", "--help"],
    ["tags", "remove", "--help"],
    ["tags", "replace", "--help"],
    ["tags", "clear-unused", "--help"],
  ])("renders offline help for %s", async (...argv: string[]): Promise<void> => {
    const result = await invokeAnki(argv);
    expect([result.code, result.invocations.length]).toEqual([0, 0]);
  });

  test("lists and filters tags without changing the result shape", async (): Promise<void> => {
    const result = await invokeAnki(["tags", "list", "--pattern", "foo"], (): string[] => [
      "foo",
      "FOO2",
      "bar",
    ]);
    expect(result.invocations).toEqual([{ action: "getTags", params: undefined }]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      tags: ["foo", "FOO2"],
      total: 2,
      filtered: true,
      totalUnfiltered: 3,
    });
  });

  test("changes and replaces tags with named repeatable options", async (): Promise<void> => {
    const added = await invokeAnki(
      ["tags", "add", "--note-id", "1", "--note-id", "2", "--tag", "x", "--tag", "y"],
      (): null => null,
    );
    expect(added.invocations[0]).toEqual({
      action: "addTags",
      params: { notes: [1, 2], tags: "x y" },
    });
    expect(JSON.parse(added.stdout)).toMatchObject({ notesAffected: 2, tagsAdded: ["x", "y"] });

    const removed = await invokeAnki(
      ["tags", "remove", "--note-id", "1", "--tag", "x   y"],
      (): null => null,
    );
    expect(removed.invocations[0]).toEqual({
      action: "removeTags",
      params: { notes: [1], tags: "x   y" },
    });
    expect(JSON.parse(removed.stdout).tagsRemoved).toEqual(["x", "y"]);
    expect(JSON.parse(removed.stdout).message).toContain("2 tag(s)");

    const replaced = await invokeAnki(
      ["tags", "replace", "--note-id", "3", "--from", "old", "--to", "new"],
      (): null => null,
    );
    expect(replaced.invocations[0]).toEqual({
      action: "replaceTags",
      params: { notes: [3], tag_to_replace: "old", replace_with_tag: "new" },
    });

    const cleared = await invokeAnki(["tags", "clear-unused", "--yes"], (): null => null);
    expect(cleared.invocations[0]?.action).toBe("clearUnusedTags");
    expect(JSON.parse(cleared.stdout).success).toBe(true);
  });

  test("requires confirmation and previews every tag mutation without calls", async (): Promise<void> => {
    expect((await invokeAnki(["tags", "clear-unused"])).code).toBe(2);
    for (const argv of [
      ["tags", "add", "--note-id", "1", "--tag", "x", "--dry-run"],
      ["tags", "remove", "--note-id", "1", "--tag", "x", "--dry-run"],
      ["tags", "replace", "--note-id", "1", "--from", "x", "--to", "y", "--dry-run"],
      ["tags", "clear-unused", "--yes", "--dry-run"],
    ]) {
      const result = await invokeAnki(argv);
      expect([result.code, result.invocations.length, JSON.parse(result.stdout).dryRun]).toEqual([
        0,
        0,
        true,
      ]);
    }
    expect((await invokeAnki(["tags", "add", "1", "x"])).code).toBe(2);
    expect((await invokeAnki(["tags", "remove", "1", "--tag", "x"])).code).toBe(2);
    expect((await invokeAnki(["tags", "replace", "1", "--from", "x", "--to", "y"])).code).toBe(2);
  });
});
