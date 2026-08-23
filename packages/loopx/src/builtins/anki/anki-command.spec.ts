import { channel } from "node:diagnostics_channel";
import { describe, expect, test } from "vitest";
import { runCli, type CliRequest } from "../../cli/run";
import type { BuiltinCommand, JsonValue } from "../../cli/types";
import { createAnkiCommand, type AnkiDependencies } from "./anki-command";
import type { AnkiConfig } from "./config";
import { AnkiOperationError } from "./errors";
import type { AnkiPort } from "./port";

interface Invocation {
  readonly action: string;
  readonly params: Readonly<Record<string, JsonValue>> | undefined;
}

const scriptedPort = (
  responses: Readonly<Record<string, unknown>>,
  invocations: Invocation[],
): AnkiPort => ({
  invoke: async <Result>(
    action: string,
    params?: Readonly<Record<string, JsonValue>>,
  ): Promise<Result> => {
    invocations.push({ action, params });
    const response = responses[action];
    if (response instanceof Error) throw response;
    return response as Result;
  },
});

const invoke = async (
  argv: readonly string[],
  dependencies: AnkiDependencies,
  env: Readonly<Record<string, string | undefined>> = {},
): Promise<{ code: number; stdout: string; stderr: string }> => {
  let stdout = "";
  let stderr = "";
  const request: CliRequest = {
    argv: ["anki", ...argv, "--compact"],
    cwd: process.cwd(),
    env,
    signal: new AbortController().signal,
    stdin: { readLine: async (): Promise<null> => null },
    stdout: { write: (chunk: string): void => void (stdout += chunk) },
    stderr: { write: (chunk: string): void => void (stderr += chunk) },
  };
  const code = await runCli(request, [(): BuiltinCommand => createAnkiCommand(dependencies)]);
  return { code, stdout, stderr };
};

describe("loopx anki decks", (): void => {
  test.each([
    ["--help"],
    ["decks", "--help"],
    ["decks", "list", "--help"],
    ["decks", "stats", "--help"],
    ["decks", "create", "--help"],
    ["decks", "move", "--help"],
  ])("renders offline help for %s", async (...argv: string[]): Promise<void> => {
    let connections = 0;
    const result = await invoke(argv, {
      connect: (): AnkiPort => {
        connections += 1;
        throw new Error("offline");
      },
    });
    expect(result.code).toBe(0);
    expect(connections).toBe(0);
  });

  test("lists decks and honors scoped connection config", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    let url = "";
    const result = await invoke(
      ["decks", "list", "--anki-connect", "http://127.0.0.1:9999", "--dry-run"],
      {
        connect: (config: AnkiConfig): AnkiPort => {
          url = config.url;
          return scriptedPort({ deckNames: ["Default", "Work"] }, invocations);
        },
      },
    );
    expect([result.code, url]).toEqual([0, "http://127.0.0.1:9999"]);
    expect(JSON.parse(result.stdout)).toMatchObject({ success: true, total: 2 });
    expect(invocations).toEqual([{ action: "deckNames", params: undefined }]);
  });

  test("previews create and move with zero Anki actions", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    const dependencies = {
      connect: (): AnkiPort => scriptedPort({}, invocations),
    };
    const created = await invoke(["decks", "create", "--name", "Work", "--dry-run"], dependencies);
    const moved = await invoke(
      ["decks", "move", "--deck", "Work", "--card-id", "1", "2", "--dry-run"],
      dependencies,
    );
    expect(JSON.parse(created.stdout)).toMatchObject({
      dryRun: true,
      preview: { actions: [{ action: "createDeck", params: { deck: "Work" } }] },
    });
    expect(JSON.parse(moved.stdout)).toMatchObject({
      dryRun: true,
      preview: { actions: [{ action: "changeDeck", params: { cards: [1, 2], deck: "Work" } }] },
    });
    expect(invocations).toEqual([]);
  });

  test("executes create and move with named options", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    const port = scriptedPort(
      {
        deckNames: [],
        createDeck: 42,
        cardsInfo: [{ cardId: 7 }],
        changeDeck: null,
      },
      invocations,
    );
    const dependencies = { connect: (): AnkiPort => port };
    expect((await invoke(["decks", "create", "--name", "Work"], dependencies)).code).toBe(0);
    expect(
      (await invoke(["decks", "move", "--deck", "Work", "--card-id", "7"], dependencies)).code,
    ).toBe(0);
    expect(invocations).toContainEqual({ action: "createDeck", params: { deck: "Work" } });
    expect(invocations).toContainEqual({
      action: "changeDeck",
      params: { cards: [7], deck: "Work" },
    });
  });

  test("reports deck statistics through the expected Anki actions", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    const result = await invoke(["decks", "stats", "--deck", "Work"], {
      connect: (): AnkiPort =>
        scriptedPort(
          {
            deckNamesAndIds: { Work: 1 },
            getDeckStats: {
              "1": { new_count: 1, learn_count: 2, review_count: 3, total_in_deck: 8 },
            },
            findCards: [],
          },
          invocations,
        ),
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      deck: "Work",
      counts: { total: 8, new: 1, learning: 2, review: 3, other: 2 },
    });
    expect(invocations).toEqual([
      { action: "deckNamesAndIds", params: {} },
      { action: "getDeckStats", params: { decks: ["Work"] } },
      { action: "findCards", params: { query: '"deck:Work"' } },
    ]);
  });

  test("preserves list statistics summary semantics", async (): Promise<void> => {
    const result = await invoke(["decks", "list", "--stats"], {
      connect: (): AnkiPort =>
        scriptedPort(
          {
            deckNames: ["Root", "Root::Child", "Other"],
            deckNamesAndIds: { Root: 1, "Root::Child": 2, Other: 3 },
            getDeckStats: {
              "1": { deck_id: 1, new_count: 2, learn_count: 3, review_count: 4, total_in_deck: 5 },
              "2": { deck_id: 2, new_count: 1, learn_count: 1, review_count: 1, total_in_deck: 6 },
              "3": { deck_id: 3, new_count: 7, learn_count: 8, review_count: 9, total_in_deck: 10 },
            },
          },
          [],
        ),
    });
    expect(JSON.parse(result.stdout).summary).toEqual({
      total_cards: 21,
      new_cards: 9,
      learning_cards: 11,
      review_cards: 13,
    });
  });

  test("preserves state filters, escaped scope, and distribution shape", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    const result = await invoke(["decks", "stats", "--deck", "JLPT_N5*"], {
      connect: (): AnkiPort =>
        scriptedPort(
          {
            deckNamesAndIds: { "JLPT_N5*": 1 },
            getDeckStats: { "1": { total_in_deck: 2 } },
            findCards: [10, 11],
            getEaseFactors: [2000, 3000],
            getIntervals: [7, 21],
          },
          invocations,
        ),
    });
    const output = JSON.parse(result.stdout);
    expect(output.states).toEqual({ new: 2, learning: 2, review: 2, suspended: 2, buried: 2 });
    expect(output.ease).toEqual({
      mean: 2.5,
      median: 2.5,
      min: 2,
      max: 3,
      count: 2,
      buckets: { "<2": 0, "2-2.5": 1, "2.5-3": 0, ">3": 1 },
    });
    expect(
      invocations.slice(3, 8).map((entry: Invocation): string => {
        const query = entry.params?.["query"];
        return typeof query === "string" ? query : "";
      }),
    ).toEqual([
      '"deck:JLPT\\_N5\\*" is:new -is:suspended -is:buried',
      '"deck:JLPT\\_N5\\*" is:learn -is:suspended -is:buried',
      '"deck:JLPT\\_N5\\*" is:review -is:learn -is:suspended -is:buried',
      '"deck:JLPT\\_N5\\*" is:suspended',
      '"deck:JLPT\\_N5\\*" is:buried',
    ]);
  });

  test("creates arbitrary-depth decks and reports the direct parent", async (): Promise<void> => {
    const invocations: Invocation[] = [];
    const dependencies = {
      connect: (): AnkiPort =>
        scriptedPort({ deckNames: ["Root", "Root::Child"], createDeck: 42 }, invocations),
    };
    const result = await invoke(["decks", "create", "--name", "Root::Child"], dependencies);
    expect(JSON.parse(result.stdout)).toMatchObject({
      parentDeck: "Root",
      childDeck: "Child",
      parentExisted: true,
      message: 'Found existing parent deck "Root"; created child deck "Child"',
    });
    const nested = await invoke(["decks", "create", "--name", "Root::Child::Leaf"], dependencies);
    expect(nested.code).toBe(0);
    expect(JSON.parse(nested.stdout)).toMatchObject({
      parentDeck: "Root::Child",
      childDeck: "Leaf",
      parentExisted: true,
      message: 'Found existing parent deck "Root::Child"; created child deck "Leaf"',
    });
    expect(invocations).toContainEqual({
      action: "createDeck",
      params: { deck: "Root::Child::Leaf" },
    });
  });

  test("rejects empty hierarchy segments before connecting", async (): Promise<void> => {
    let connections = 0;
    const result = await invoke(["decks", "create", "--name", "Root::Child::::Leaf"], {
      connect: (): AnkiPort => {
        connections += 1;
        return scriptedPort({}, []);
      },
    });
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      error: "Deck name parts cannot be empty",
    });
    expect(connections).toBe(0);
  });

  test("diagnoses a failed best-effort parent-deck lookup", async (): Promise<void> => {
    const events: unknown[] = [];
    const diagnostics = channel("loopx.anki");
    const receive = (message: unknown): void => void events.push(message);
    diagnostics.subscribe(receive);
    try {
      const result = await invoke(
        ["decks", "create", "--name", "Root::Child"],
        {
          connect: (): AnkiPort =>
            scriptedPort({ deckNames: new Error("lookup failed"), createDeck: 42 }, []),
        },
        { LOG_LEVEL: "warn" },
      );
      expect(result.code).toBe(0);
    } finally {
      diagnostics.unsubscribe(receive);
    }
    expect(events).toContainEqual({
      level: "warn",
      message: "Could not determine whether parent deck exists: lookup failed",
    });
  });

  test("keeps Anki action and hint in runtime errors", async (): Promise<void> => {
    const result = await invoke(["decks", "list"], {
      connect: (): AnkiPort =>
        scriptedPort({ deckNames: new AnkiOperationError("offline", "deckNames") }, []),
    });
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      action: "listDecks",
      hint: "Make sure Anki is running",
    });
    const stats = await invoke(["decks", "stats", "--deck", "Work"], {
      connect: (): AnkiPort =>
        scriptedPort({ deckNamesAndIds: new AnkiOperationError("offline", "deckNamesAndIds") }, []),
    });
    expect(JSON.parse(stats.stderr)).toMatchObject({
      success: false,
      action: "deckStats",
      hint: "Make sure Anki is running and the deck name is valid",
    });
  });

  test("blocks writes in read-only mode before connecting", async (): Promise<void> => {
    let connections = 0;
    const result = await invoke(["--read-only", "decks", "create", "--name", "Work"], {
      connect: (): AnkiPort => {
        connections += 1;
        return scriptedPort({}, []);
      },
    });
    expect([result.code, connections]).toEqual([1, 0]);
    expect(JSON.parse(result.stderr)).toMatchObject({ action: "createDeck", success: false });
  });

  test("rejects positional forms as usage errors", async (): Promise<void> => {
    const result = await invoke(["decks", "create", "Work"], {
      connect: (): AnkiPort => scriptedPort({}, []),
    });
    expect(result.code).toBe(2);
  });
});
