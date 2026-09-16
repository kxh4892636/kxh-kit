import { afterEach, describe, expect, test } from "vitest";
import { channel } from "node:diagnostics_channel";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { type InvocationContext } from "../../cli/types";
import { loadAnkiConfig } from "./config";
import { AnkiOperationError, JsonError, ReadOnlyModeError } from "./errors";
import { readTextInput } from "./input";
import { createLogger, type Logger } from "./logger";
import { toJson } from "./runtime";
import { invokeAnki } from "./testing/test-harness";
import {
  cleanHtml,
  deckScopeQuery,
  extractRenderedCardContent,
  getCardType,
  getRatingDescription,
} from "./cards/card-domain";
import { cardIds, numbers } from "./decks";
import { createTemplates, nonNegative, strings as modelStrings, templates } from "./models";
import { duplicateScope, fields, ids, media, parseBatch, strings as noteStrings } from "./notes";

describe("Anki parser contracts", (): void => {
  test("normalizes every supported rendered-card construct", (): void => {
    const html = [
      '<style type="text/css">.x { color: red; }</style>',
      '<script type="text/javascript">alert("x")</script>',
      "<div>A&nbsp;&lt;&gt;&quot;&#39;&amp;</div>",
      "<p>B<br>C<br/>D<br />E</p>",
      "<span>  spaced\ttext </span>\n\n\n tail",
    ].join("");

    expect(cleanHtml(html)).toBe(`A <>"'&\nB\nC\nD\nE\nspaced text\ntail`);
    expect(
      extractRenderedCardContent({
        question: "<b>Front</b>",
        answer: "ignored<hr class=x id='answer' data-x=1><i>Back</i>",
      }),
    ).toStrictEqual({ front: "Front", back: "Back" });
    expect(deckScopeQuery('A\\B"C*D_E')).toBe('"deck:A\\\\B\\"C\\*D\\_E"');
    expect([0, 1, 2, 3, 4].map(getCardType)).toStrictEqual([
      "new",
      "learning",
      "review",
      "relearning",
      "unknown",
    ]);
    expect([1, 2, 3, 4, 5].map(getRatingDescription)).toStrictEqual([
      "Again (failed to recall)",
      "Hard (recalled with difficulty)",
      "Good (recalled with some effort)",
      "Easy (recalled instantly)",
      "Unknown",
    ]);
  });

  test("parses scalar and repeated numeric options exactly", (): void => {
    expect(numbers(undefined, "--buckets")).toBeUndefined();
    expect(numbers(" 1,2.5, 3 ", "--buckets")).toStrictEqual([1, 2.5, 3]);
    expect(cardIds("7")).toStrictEqual([7]);
    expect(cardIds(["7", "8"])).toStrictEqual([7, 8]);
    expect(modelStrings(undefined)).toStrictEqual([]);
    expect(modelStrings("x")).toStrictEqual(["x"]);
    expect(modelStrings(["x", "y"])).toStrictEqual(["x", "y"]);
    expect(noteStrings(undefined)).toStrictEqual([]);
    expect(noteStrings("x")).toStrictEqual(["x"]);
    expect(noteStrings(["x", "y"])).toStrictEqual(["x", "y"]);
    expect(nonNegative("0", "--index")).toBe(0);
    expect(nonNegative("2", "--index")).toBe(2);
  });

  test.each(["", "0", "-1", "1,0", "1,NaN", Array(21).fill("1").join(",")])(
    "rejects invalid bucket input %j",
    (value: string): void => {
      expect(() => numbers(value, "--buckets")).toThrow(
        "--buckets must contain one to twenty positive numbers",
      );
    },
  );

  test.each([undefined, [], "0", "-1", "1.5", "x", ["1", "0"]])(
    "rejects invalid card identifiers %j",
    (value): void => {
      expect(() => cardIds(value)).toThrow("--card-id values must be positive integers");
    },
  );

  test("parses model template shapes exactly", (): void => {
    expect(templates('{"Card":{"Front":"Q","Back":"A"}}')).toStrictEqual({
      Card: { Front: "Q", Back: "A" },
    });
    expect(createTemplates('[{"Name":"Card","Front":"Q","Back":"A"}]')).toStrictEqual([
      { Name: "Card", Front: "Q", Back: "A" },
    ]);
  });

  test.each([
    "null",
    "[]",
    "{}",
    '{"Card":null}',
    '{"Card":{}}',
    '{"Card":{"Front":1,"Back":"A"}}',
    '{"Card":{"Front":"","Back":"A"}}',
    '{"Card":{"Front":"Q","Back":1}}',
    '{"Card":{"Front":"Q","Back":""}}',
  ])("rejects invalid update template JSON %s", (value: string): void => {
    expect(() => templates(value)).toThrow("--templates requires JSON");
  });

  test.each([
    "null",
    "{}",
    "[]",
    "[null]",
    "[{}]",
    '[{"Name":1,"Front":"Q","Back":"A"}]',
    '[{"Name":"","Front":"Q","Back":"A"}]',
    '[{"Name":"Card","Front":1,"Back":"A"}]',
    '[{"Name":"Card","Front":"","Back":"A"}]',
    '[{"Name":"Card","Front":"Q","Back":1}]',
    '[{"Name":"Card","Front":"Q","Back":""}]',
  ])("rejects invalid create template JSON %s", (value: string): void => {
    expect(() => createTemplates(value)).toThrow("--templates requires JSON");
  });

  test("parses note option shapes exactly", (): void => {
    expect(fields(["Front=Question", "Back=Answer=More"])).toStrictEqual({
      Front: "Question",
      Back: "Answer=More",
    });
    expect(ids(["1", "2"], "--note-id")).toStrictEqual([1, 2]);
    expect(duplicateScope(undefined)).toBeUndefined();
    expect(duplicateScope("deck")).toBe("deck");
    expect(duplicateScope("collection")).toBe("collection");
    expect(media(undefined, "--audio")).toBeUndefined();
    expect(
      media('{"url":"https://example.test/a","filename":"a.mp3","fields":["Front"]}', "--audio"),
    ).toStrictEqual([{ url: "https://example.test/a", filename: "a.mp3", fields: ["Front"] }]);
    expect(parseBatch('[{"fields":{"Front":"Q"},"tags":["one"]}]')).toStrictEqual([
      { fields: { Front: "Q" }, tags: ["one"] },
    ]);
  });
});

describe("Anki parser contracts", (): void => {
  test.each(["bad", "=value"])("rejects malformed field pair %j", (value: string): void => {
    expect(() => fields(value)).toThrow(`--field requires k=v: "${value}"`);
  });

  test.each(["", "0", "-1", "1.5", "x", Array(101).fill("1")])(
    "rejects invalid note identifiers",
    (value): void => {
      expect(() => ids(value, "--note-id")).toThrow(
        "--note-id requires one to one hundred positive integers",
      );
    },
  );

  test.each(["", "all"])("rejects duplicate scope %j", (value: string): void => {
    expect(() => duplicateScope(value)).toThrow("--duplicate-scope must be deck or collection");
  });

  test.each([
    "null",
    "{}",
    '{"url":1,"filename":"a","fields":["Front"]}',
    '{"url":"u","filename":1,"fields":["Front"]}',
    '{"url":"u","filename":"a","fields":null}',
    '{"url":"u","filename":"a","fields":[1]}',
    '{"url":"","filename":"a","fields":["Front"]}',
    '{"url":"u","filename":"","fields":["Front"]}',
    '{"url":"u","filename":"a","fields":[]}',
  ])("rejects invalid media JSON %s", (value: string): void => {
    expect(() => media(value, "--audio")).toThrow("--audio requires JSON");
  });

  test.each([
    "not json",
    "null",
    "{}",
    "[]",
    "[null]",
    "[{}]",
    '[{"fields":null}]',
    '[{"fields":[]}]',
    '[{"fields":{"Front":1}}]',
    '[{"fields":{"Front":"Q"},"tags":null}]',
    '[{"fields":{"Front":"Q"},"tags":[1]}]',
  ])("rejects invalid batch JSON %s", (value: string): void => {
    expect(() => parseBatch(value)).toThrow();
  });
});

describe("Anki runtime primitives", (): void => {
  test("error types preserve names and every structured field", (): void => {
    const json = new JsonError("bad json", {
      action: "parse",
      details: { field: "x" },
      hint: "fix it",
    });
    expect({
      action: json.action,
      details: json.details,
      hint: json.hint,
      message: json.message,
      name: json.name,
    }).toEqual({
      action: "parse",
      details: { field: "x" },
      hint: "fix it",
      message: "bad json",
      name: "JsonError",
    });

    const operation = new AnkiOperationError("offline", "sync", {
      details: { attempt: 2 },
      hint: "start Anki",
    });
    expect({
      action: operation.action,
      details: operation.details,
      hint: operation.hint,
      message: operation.message,
      name: operation.name,
    }).toEqual({
      action: "sync",
      details: { attempt: 2 },
      hint: "start Anki",
      message: "offline",
      name: "AnkiOperationError",
    });

    const readOnly = new ReadOnlyModeError("deleteNotes");
    expect({ action: readOnly.action, message: readOnly.message, name: readOnly.name }).toEqual({
      action: "deleteNotes",
      message:
        'Action "deleteNotes" is blocked: Anki is running in read-only mode. Remove --read-only to enable writes.',
      name: "ReadOnlyModeError",
    });
  });

  test("logger publishes only messages at or above its configured rank", (): void => {
    const events: unknown[] = [];
    const diagnosticChannel = channel("nnf.anki");
    const subscriber = (message: unknown): void => void events.push(message);
    diagnosticChannel.subscribe(subscriber);
    try {
      const log = createLogger("info");
      log.debug("hidden");
      log.info("visible info");
      log.warn("visible warning");
    } finally {
      diagnosticChannel.unsubscribe(subscriber);
    }
    expect(events).toEqual([
      { level: "info", message: "visible info" },
      { level: "warn", message: "visible warning" },
    ]);
  });
});

const directories: string[] = [];

const context = (
  env: Readonly<Record<string, string | undefined>> = {},
  stdin: InvocationContext["stdin"] = { readLine: async (): Promise<null> => null },
  cwd: string = process.cwd(),
): InvocationContext => ({
  cwd,
  env,
  stdin,
  signal: new AbortController().signal,
  debug: false,
  dryRun: false,
});

afterEach(async (): Promise<void> => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory: string) => rm(directory, { force: true, recursive: true })),
  );
});

describe("Anki runtime configuration", (): void => {
  test("uses defaults, CLI URL precedence, environment values, and read-only spellings", (): void => {
    expect(loadAnkiConfig({}, context())).toEqual({
      url: "http://localhost:8765",
      apiKey: undefined,
      apiVersion: 6,
      timeout: 5000,
      readOnly: false,
      logLevel: "info",
    });

    for (const readOnly of ["true", "1"]) {
      expect(
        loadAnkiConfig(
          { "anki-connect": "http://cli:1234", "read-only": false },
          context({
            ANKI_CONNECT_URL: "http://env:8765",
            ANKI_CONNECT_API_KEY: "secret",
            ANKI_CONNECT_API_VERSION: "7",
            ANKI_CONNECT_TIMEOUT: "123",
            LOG_LEVEL: "debug",
            READ_ONLY: readOnly,
          }),
        ),
      ).toMatchObject({
        url: "http://cli:1234",
        apiKey: "secret",
        apiVersion: 7,
        timeout: 123,
        readOnly: true,
        logLevel: "debug",
      });
    }

    for (const level of ["info", "warn", "error"] as const) {
      expect(loadAnkiConfig({ "read-only": true }, context({ LOG_LEVEL: level }))).toMatchObject({
        readOnly: true,
        logLevel: level,
      });
    }
  });

  test.each([
    [{ ANKI_CONNECT_API_VERSION: "0" }, "ANKI_CONNECT_API_VERSION must be positive"],
    [{ ANKI_CONNECT_TIMEOUT: "1.5" }, "ANKI_CONNECT_TIMEOUT must be positive"],
    [{ LOG_LEVEL: "verbose" }, "LOG_LEVEL must be"],
  ])("rejects invalid environment config %#", (env, message): void => {
    expect(() => loadAnkiConfig({}, context(env))).toThrow(message);
  });

  test("rejects an invalid CLI URL", (): void => {
    expect(() => loadAnkiConfig({ "anki-connect": "not a url" }, context())).toThrow(
      "--anki-connect must be a valid URL",
    );
  });
});

describe("Anki text input", (): void => {
  test("reads injected sources, readAll stdin, line stdin, and real files", async (): Promise<void> => {
    expect(
      await readTextInput("virtual", context(), {
        connect: (): never => {
          throw new Error("unused");
        },
        readText: async (source: string): Promise<string> => `injected:${source}`,
      }),
    ).toBe("injected:virtual");

    expect(
      await readTextInput(
        "-",
        context(
          {},
          { readAll: async (): Promise<string> => "whole stdin", readLine: async () => null },
        ),
        { connect: (): never => Promise.reject(new Error("unused")) as never },
      ),
    ).toBe("whole stdin");

    const lines = ["first", "second", null];
    expect(
      await readTextInput(
        "-",
        context({}, { readLine: async (): Promise<null | string> => lines.shift() ?? null }),
        { connect: (): never => Promise.reject(new Error("unused")) as never },
      ),
    ).toBe("first\nsecond");

    const directory = await mkdtemp(path.join(tmpdir(), "nf-input-"));
    directories.push(directory);
    await writeFile(path.join(directory, "input.txt"), "file content", "utf8");
    expect(
      await readTextInput("input.txt", context({}, undefined, directory), {
        connect: (): never => Promise.reject(new Error("unused")) as never,
      }),
    ).toBe("file content");
  });

  test.each([
    [new Error("disk failure"), "disk failure"],
    ["primitive failure", "primitive failure"],
  ])(
    "logs and normalizes input failure %#",
    async (failure: unknown, warning: string): Promise<void> => {
      const warnings: string[] = [];
      const logger: Logger = {
        debug: (): void => undefined,
        info: (): void => undefined,
        warn: (message: string): void => {
          warnings.push(message);
        },
      };
      await expect(
        readTextInput(
          "broken",
          context(),
          {
            connect: (): never => Promise.reject(new Error("unused")) as never,
            readText: async (): Promise<never> => Promise.reject(failure),
          },
          logger,
        ),
      ).rejects.toThrow("Unable to read input file: broken");
      expect(warnings[0]).toContain(warning);
    },
  );
});

describe("Anki CLI option and JSON boundaries", (): void => {
  test.each([
    ["", "--ease-buckets"],
    ["1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21", "--ease-buckets"],
    ["1,NaN", "--ease-buckets"],
    ["-1", "--interval-buckets"],
  ])("rejects invalid bucket list %s", async (value: string, flag: string): Promise<void> => {
    const result = await invokeAnki(["decks", "stats", "--deck", "Work", flag, value]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("one to twenty positive numbers");
  });

  test.each(["0", "-1", "1.5", "NaN"])(
    "rejects invalid card ID %s",
    async (cardId: string): Promise<void> => {
      const result = await invokeAnki(["decks", "move", "--card-id", cardId, "--deck", "Work"]);
      expect(result.code).toBe(2);
    },
  );

  test("rejects whitespace-only deck names", async (): Promise<void> => {
    expect(
      (await invokeAnki(["decks", "move", "--card-id", "1", "--deck", "   "])).stderr,
    ).toContain("--deck cannot be empty");
  });

  test("serializes JSON values and rejects undefined", async (): Promise<void> => {
    await expect(toJson(Promise.resolve({ value: 1 }))).resolves.toEqual({ value: 1 });
    await expect(toJson(Promise.resolve(undefined))).rejects.toMatchObject({
      action: "serializeResult",
      message: "Operation returned a non-JSON result",
    });
  });
});
