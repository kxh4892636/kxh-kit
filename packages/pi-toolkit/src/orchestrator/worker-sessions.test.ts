import { afterEach, describe, expect, it } from "vite-plus/test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nextTempSeq,
  openWorkerSession,
  readWorkerSessionIndex,
  rememberWorkerSession,
  workerSessionId,
  WORKERS_FILE,
} from "./worker-sessions.ts";

const dirs: string[] = [];
const tempDir = async (prefix: string): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** 往会话里写一条用户消息：pi 只在有对话之后才真正落盘 jsonl。 */
const greet = (manager: ReturnType<typeof openWorkerSession>["manager"], text: string): void => {
  manager.appendMessage({ role: "user", content: text, timestamp: Date.now() } as never);
};

describe("worker 会话落盘与按需恢复", () => {
  it("会话 id 由工作键哈希得到，同一个键永远同一个 id", () => {
    expect(workerSessionId("temp:1")).toBe(workerSessionId("temp:1"));
    expect(workerSessionId("temp:1")).not.toBe(workerSessionId("temp:2"));
    // pi 的会话 id 只允许 [A-Za-z0-9._-]：路径与中文都被哈希掉。
    expect(workerSessionId("/w/.agents/domains/中文/plans/active/p::01,02")).toMatch(
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    );
  });

  it("新建的会话在盘上留下 jsonl，同键再开就续上历史", async () => {
    const cwd = await tempDir("pi-session-cwd-");
    const sessionDir = await tempDir("pi-session-dir-");
    const stateDir = await tempDir("pi-session-state-");
    const key = "temp:1";

    const first = openWorkerSession({ key, cwd, stateDir, sessionDir });
    expect(first.resumed).toBe(false);
    expect(first.path.endsWith(".jsonl")).toBe(true);
    greet(first.manager, "第一轮的结论");
    expect(existsSync(first.path)).toBe(true);

    // 模拟实例被 dispose：丢掉第一个 SessionManager，按同一个键重开。
    const second = openWorkerSession({ key, cwd, stateDir, sessionDir });
    expect(second.resumed).toBe(true);
    expect(second.path).toBe(first.path);
    const messages = second.manager.buildSessionContext().messages;
    expect(messages).toHaveLength(1);
    expect(JSON.stringify(messages[0])).toContain("第一轮的结论");
  });

  it("索引丢了也能按会话 id 从磁盘找回", async () => {
    const cwd = await tempDir("pi-session-cwd-");
    const sessionDir = await tempDir("pi-session-dir-");
    const stateDir = await tempDir("pi-session-state-");
    const key = "/w/.agents/domains/pi/plans/active/2026-11-07-x::01";

    const first = openWorkerSession({ key, cwd, stateDir, sessionDir });
    greet(first.manager, "分组 worker 的上下文");
    const files = await readdir(sessionDir);
    expect(files.some((name) => name.includes(workerSessionId(key)))).toBe(true);

    await rm(join(stateDir, WORKERS_FILE), { force: true });
    expect(readWorkerSessionIndex(stateDir).sessions).toEqual({});

    const second = openWorkerSession({ key, cwd, stateDir, sessionDir });
    expect(second.resumed).toBe(true);
    expect(second.path).toBe(first.path);
    expect(second.manager.buildSessionContext().messages).toHaveLength(1);
  });

  it("临时 id 序号从盘上已知的键推出来，重启后不会重发 temp:1", async () => {
    const stateDir = await tempDir("pi-session-state-");
    expect(nextTempSeq(stateDir)).toBe(1);
    rememberWorkerSession(stateDir, "temp:1");
    rememberWorkerSession(stateDir, "temp:3");
    rememberWorkerSession(stateDir, "/w/p::01,02");
    expect(nextTempSeq(stateDir)).toBe(4);
  });

  it("索引损坏时不抛错，按空索引处理", async () => {
    const stateDir = await tempDir("pi-session-state-");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(stateDir, WORKERS_FILE), "{ not json", "utf8");
    expect(readWorkerSessionIndex(stateDir)).toEqual({ sessions: {} });
    expect(nextTempSeq(stateDir)).toBe(1);
  });
});
