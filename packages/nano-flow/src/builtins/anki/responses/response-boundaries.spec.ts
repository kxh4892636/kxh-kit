import { describe, expect, test } from "vitest";
import type { z } from "zod";
import { AnkiOperationError } from "../errors";
import {
  ankiCardArrayResponse,
  base64OrFalseResponse,
  booleanResponse,
  cardPresenceArrayResponse,
  cardScheduleArrayResponse,
  modelCreateResponse,
  modelStylingResponse,
  modelTemplatesResponse,
  noteDeleteArrayResponse,
  noteInfoArrayResponse,
  noteUpdateArrayResponse,
  nullResponse,
  numberArrayResponse,
  optionalNumberResponse,
  parseResponse,
  stringArrayResponse,
  stringOrFalseResponse,
  stringResponse,
} from ".";

const accepts = (schema: z.ZodType, ...values: unknown[]): void => {
  for (const value of values) expect(schema.safeParse(value).success).toBe(true);
};

const rejects = (schema: z.ZodType, ...values: unknown[]): void => {
  for (const value of values) expect(schema.safeParse(value).success).toBe(false);
};

describe("AnkiConnect response schemas", (): void => {
  test("validates scalar and array response boundaries", (): void => {
    accepts(stringArrayResponse, null, [], ["x"]);
    rejects(stringArrayResponse, undefined, "x", [1]);
    accepts(numberArrayResponse, null, [], [1]);
    rejects(numberArrayResponse, undefined, 1, ["1"]);
    accepts(optionalNumberResponse, null, 0, 1);
    rejects(optionalNumberResponse, undefined, "1");
    accepts(nullResponse, null);
    rejects(nullResponse, undefined, false);
    accepts(booleanResponse, true, false);
    rejects(booleanResponse, 0, "true");
    accepts(stringResponse, "x");
    rejects(stringResponse, "", 1);
    accepts(stringOrFalseResponse, "", "x", false);
    rejects(stringOrFalseResponse, true, 0);
    accepts(base64OrFalseResponse, "eA==", false);
    rejects(base64OrFalseResponse, "not base64", true);
  });

  test("validates model response shapes and preserves passthrough fields", (): void => {
    expect(modelCreateResponse.parse({ extra: true, id: 1 })).toEqual({ extra: true, id: 1 });
    accepts(modelCreateResponse, {});
    rejects(modelCreateResponse, null, { id: "1" });

    expect(modelStylingResponse.parse({ css: ".card{}", extra: true })).toEqual({
      css: ".card{}",
      extra: true,
    });
    accepts(modelStylingResponse, null, { css: "" });
    rejects(modelStylingResponse, {}, { css: 1 });

    const templates = { Card: { Back: "{{Back}}", Front: "{{Front}}", extra: true } };
    expect(modelTemplatesResponse.parse(templates)).toEqual(templates);
    accepts(modelTemplatesResponse, null, {});
    rejects(modelTemplatesResponse, [], { Card: {} }, { Card: { Back: 1, Front: "x" } });
  });

  test("validates note info, update, and delete response shapes", (): void => {
    const note = {
      cards: [2],
      fields: { Front: { order: 0, value: "Q", extra: true } },
      mod: 3,
      modelName: "Basic",
      noteId: 1,
      tags: ["tag"],
      extra: true,
    };
    expect(noteInfoArrayResponse.parse([note, {}, null])).toEqual([note, {}, null]);
    for (const key of ["cards", "fields", "mod", "modelName", "noteId", "tags"] as const) {
      const invalid = { ...note };
      delete invalid[key];
      rejects(noteInfoArrayResponse, [invalid]);
    }
    rejects(
      noteInfoArrayResponse,
      [{ ...note, fields: { Front: { order: 0 } } }],
      [{ ...note, fields: { Front: { value: "Q" } } }],
    );
    rejects(noteInfoArrayResponse, [undefined], [{ noteId: "1" }]);

    expect(
      noteUpdateArrayResponse.parse([{ fields: { Front: {} }, modelName: "Basic", extra: true }]),
    ).toEqual([{ fields: { Front: {} }, modelName: "Basic", extra: true }]);
    rejects(noteUpdateArrayResponse, [{}], [{ fields: [], modelName: "Basic" }]);

    expect(noteDeleteArrayResponse.parse([{ cards: [2], extra: true, noteId: 1 }, {}])).toEqual([
      { cards: [2], extra: true, noteId: 1 },
      {},
    ]);
    rejects(noteDeleteArrayResponse, [null], [{ cards: ["2"] }], [{ noteId: "1" }]);
  });

  test("validates complete, presence, and schedule card shapes", (): void => {
    const card = {
      answer: "A",
      cardId: 1,
      deckName: "D",
      modelName: "M",
      note: 2,
      question: "Q",
      type: 0,
      extra: true,
    };
    expect(ankiCardArrayResponse.parse([card])).toEqual([card]);
    for (const key of [
      "answer",
      "cardId",
      "deckName",
      "modelName",
      "note",
      "question",
      "type",
    ] as const) {
      const invalid = { ...card };
      delete invalid[key];
      rejects(ankiCardArrayResponse, [invalid]);
    }
    rejects(ankiCardArrayResponse, null, [null]);

    expect(cardPresenceArrayResponse.parse([{ cardId: 1, extra: true }])).toEqual([
      { cardId: 1, extra: true },
    ]);
    rejects(cardPresenceArrayResponse, [{}], [{ cardId: "1" }]);

    const schedule = { cardId: 1, due: 2, factor: 3, interval: 4, extra: true };
    expect(cardScheduleArrayResponse.parse([schedule])).toEqual([schedule]);
    accepts(cardScheduleArrayResponse, [{ cardId: 1 }]);
    rejects(cardScheduleArrayResponse, [{}], [{ cardId: 1, due: "2" }]);
  });

  test("parseResponse returns parsed data and reports the exact failed action", (): void => {
    expect(parseResponse("names", stringArrayResponse, ["one"])).toEqual(["one"]);
    expect(() => parseResponse("names", stringArrayResponse, [1])).toThrow(
      expect.objectContaining<Partial<AnkiOperationError>>({
        action: "names",
        message: expect.stringContaining("Invalid AnkiConnect result for names"),
        name: "AnkiOperationError",
      }),
    );
  });
});
