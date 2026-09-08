import { z } from "zod";
export const portSchema = z.number().int().min(1).max(65535);
export const launchSchema = z.object({
  cwd: z.string().min(1),
  env: z.record(z.string(), z.string()),
});
export type Launch = z.infer<typeof launchSchema>;
export const requestSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("start"), launch: launchSchema }),
  z.object({ command: z.literal("stop") }),
  z.object({ command: z.literal("status") }),
]);
export type Request = z.infer<typeof requestSchema>;
export const statusSchema = z.object({
  port: portSchema,
  state: z.enum(["stopped", "starting", "running", "backoff", "failed"]),
  version: z.string().nullable(),
  pid: z.number().int().positive().nullable(),
  error: z.string().nullable(),
  log: z.string(),
  nextUpdateAt: z.string().nullable().optional(),
});
export type Status = z.infer<typeof statusSchema>;
export const replySchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), status: statusSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type Reply = z.infer<typeof replySchema>;
export const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
export const delay = async (ms: number): Promise<void> =>
  new Promise(
    (resolve: (value: void | PromiseLike<void>) => void): ReturnType<typeof setTimeout> =>
      setTimeout(resolve, ms),
  );
