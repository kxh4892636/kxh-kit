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
