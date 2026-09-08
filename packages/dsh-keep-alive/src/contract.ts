import { z } from "zod";
export const portSchema = z.number().int().min(1).max(65535);
// npm dist-tag 名；拒绝 semver 形态，避免把 --tag 1.2.3 误当版本号（版本固定不在范围内）。
export const tagSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Expected a dist-tag name such as latest, alpha or next")
  .refine((tag: string): boolean => !/^\d+\.\d+\.\d+/.test(tag), {
    message: "Expected a dist-tag name, not a version",
  });
export const launchSchema = z.object({
  cwd: z.string().min(1),
  env: z.record(z.string(), z.string()),
});
export type Launch = z.infer<typeof launchSchema>;
export const requestSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("start"), launch: launchSchema, tag: tagSchema }),
  z.object({ command: z.literal("update"), launch: launchSchema, tag: tagSchema }),
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
  // 当前跟随的发布通道；旧版 supervisor 的回复没有该字段。
  tag: z.string().nullable().optional(),
  // 已安装并记录、但尚未成为运行版本的版本；旧版 supervisor 的回复没有该字段。
  prepared: z.string().nullable().optional(),
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
