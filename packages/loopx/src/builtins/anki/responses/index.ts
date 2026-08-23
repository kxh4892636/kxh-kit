import { z } from "zod";
import { AnkiOperationError } from "../errors";

export const stringArrayResponse = z.array(z.string()).nullable();
export const numberArrayResponse = z.array(z.number()).nullable();
export const optionalNumberResponse = z.number().nullable();
export const nullResponse = z.null();
export const modelCreateResponse = z.object({ id: z.number().optional() }).passthrough();
export const modelStylingResponse = z.object({ css: z.string() }).passthrough().nullable();
export const modelTemplatesResponse = z
  .record(z.string(), z.object({ Front: z.string(), Back: z.string() }).passthrough())
  .nullable();
export const noteInfoResponse = z
  .object({
    noteId: z.number(),
    modelName: z.string(),
    fields: z.record(z.string(), z.object({ value: z.string(), order: z.number() }).passthrough()),
    tags: z.array(z.string()),
    cards: z.array(z.number()),
    mod: z.number(),
  })
  .passthrough();
export const noteInfoArrayResponse = z.array(
  z.union([noteInfoResponse, z.object({}).strict(), z.null()]),
);
export const noteUpdateArrayResponse = z.array(
  z
    .object({
      modelName: z.string(),
      fields: z.record(z.string(), z.unknown()),
    })
    .passthrough(),
);
export const noteDeleteArrayResponse = z.array(
  z.object({ noteId: z.number().optional(), cards: z.array(z.number()).optional() }).passthrough(),
);
export const ankiCardResponse = z
  .object({
    answer: z.string(),
    cardId: z.number(),
    deckName: z.string(),
    factor: z.number().optional(),
    interval: z.number().optional(),
    lapses: z.number().optional(),
    modelName: z.string(),
    note: z.number(),
    question: z.string(),
    reps: z.number().optional(),
    tags: z.array(z.string()).optional(),
    type: z.number(),
    due: z.number().optional(),
  })
  .passthrough();
export const ankiCardArrayResponse = z.array(ankiCardResponse);
export const cardPresenceArrayResponse = z.array(z.object({ cardId: z.number() }).passthrough());
export const cardScheduleArrayResponse = z.array(
  z
    .object({
      cardId: z.number(),
      due: z.number().optional(),
      factor: z.number().optional(),
      interval: z.number().optional(),
    })
    .passthrough(),
);
export const booleanResponse = z.boolean();
export const stringResponse = z.string().min(1);
export const stringOrFalseResponse = z.union([z.string(), z.literal(false)]);
export const base64OrFalseResponse = z.union([z.base64(), z.literal(false)]);

export const parseResponse = <Result>(
  action: string,
  schema: z.ZodType<Result>,
  value: unknown,
): Result => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AnkiOperationError(
      `Invalid AnkiConnect result for ${action}: ${z.prettifyError(parsed.error)}`,
      action,
    );
  }
  return parsed.data;
};
