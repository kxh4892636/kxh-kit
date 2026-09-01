import { describe, expect, test } from "vitest";
import { invokeAnki } from "../testing/test-harness";

describe("nf anki sync", (): void => {
  test("renders offline help, syncs, and previews without writes", async (): Promise<void> => {
    const help = await invokeAnki(["sync", "--help"]);
    expect([help.code, help.invocations.length]).toEqual([0, 0]);
    const synced = await invokeAnki(["sync"], (): null => null, {
      now: (): Date => new Date("2026-08-23T00:00:00.000Z"),
    });
    expect(JSON.parse(synced.stdout)).toMatchObject({
      success: true,
      timestamp: "2026-08-23T00:00:00.000Z",
    });
    expect(synced.invocations).toEqual([{ action: "sync", params: undefined }]);
    const readOnly = await invokeAnki(["sync", "--read-only"], (): null => null);
    expect([readOnly.code, readOnly.invocations[0]?.action]).toEqual([0, "sync"]);
    const dry = await invokeAnki(["sync", "--dry-run"]);
    expect([dry.code, dry.invocations.length]).toEqual([0, 0]);
    expect(JSON.parse(dry.stdout)).toMatchObject({
      dryRun: true,
      preview: { actions: [{ action: "sync" }] },
    });
  });

  test("preserves the sync runtime hint", async (): Promise<void> => {
    const result = await invokeAnki(["sync"], (): Error => new Error("offline"));
    expect(JSON.parse(result.stderr)).toMatchObject({
      action: "sync",
      hint: "Make sure Anki is running and you are logged into AnkiWeb",
    });
  });
});
