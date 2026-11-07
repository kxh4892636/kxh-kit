import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  buildRetryMessage,
  buildTimeoutEvidence,
  decideRetry,
  diagnosisFromReports,
  diagnosisPrompt,
  extractJsonObject,
  parseDiagnosis,
  readSessionTail,
  summarizeSessionLine,
  type Diagnosis,
} from "./diagnose.ts";
import type { LedgerEvent } from "./events.ts";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "pi-diagnose-"));
  created.push(dir);
  return dir;
};

const event = (seq: number, type: string, payload: Record<string, unknown>): LedgerEvent => ({
  seq,
  at: `2026-11-07T00:00:0${seq}.000Z`,
  type: type as LedgerEvent["type"],
  payload,
});

const diagnosis = (overrides: Partial<Diagnosis> = {}): Diagnosis => ({
  cause: "测试跑了 40 分钟",
  evidence: ["最后 report 是 done"],
  suggestion: { adjust: ["change-strategy"], retryMessage: "先跑单元测试" },
  confidence: 0.7,
  ...overrides,
});

describe("诊断结论解析", () => {
  it("从 ```json 围栏里抠出对象（允许前后噪声）", () => {
    const raw = extractJsonObject('结论如下：\n```json\n{"cause":"x"}\n```\n完');
    expect(raw).toEqual({ cause: "x" });
  });

  it("解析合法结论并规范化字段", () => {
    expect(
      parseDiagnosis({
        cause: "  卡在等用户回答  ",
        evidence: ["a", 1, "b"],
        suggestion: { adjust: ["needs-human", "不认识的种类"], retryMessage: "别重试" },
        confidence: 3,
      }),
    ).toEqual({
      cause: "卡在等用户回答",
      evidence: ["a", "b"],
      suggestion: { adjust: ["needs-human"], retryMessage: "别重试" },
      confidence: 1,
    });
  });

  it("缺 cause / 没有可执行建议时判为不可解析（不重试）", () => {
    expect(parseDiagnosis({ suggestion: { adjust: ["split-note"] } })).toBeUndefined();
    expect(parseDiagnosis({ cause: "x", suggestion: { adjust: [] } })).toBeUndefined();
    expect(parseDiagnosis("不是对象")).toBeUndefined();
  });

  it("先看 evidence 再看 summary：模型把 JSON 写进摘要也能救回来", () => {
    const json = JSON.stringify({
      cause: "被外部阻塞",
      evidence: [],
      suggestion: { adjust: ["narrow-scope"], retryMessage: "跳过 e2e" },
      confidence: 0.4,
    });
    expect(
      diagnosisFromReports([{ outcome: "done", note: "diagnose", summary: json }]),
    ).toMatchObject({ cause: "被外部阻塞", confidence: 0.4 });
    expect(
      diagnosisFromReports([{ outcome: "done", note: "diagnose", summary: "没给 JSON" }]),
    ).toBeUndefined();
  });
});

describe("重试决策", () => {
  it("有可执行建议且未到上限才重派", () => {
    expect(decideRetry({ diagnosis: diagnosis(), attempts: 0, retryLimit: 2 })).toEqual({
      retry: true,
      attempt: 1,
    });
    expect(decideRetry({ diagnosis: diagnosis(), attempts: 1, retryLimit: 2 })).toEqual({
      retry: true,
      attempt: 2,
    });
  });

  it("到上限、建议人工、诊断不可解析都不重派", () => {
    expect(decideRetry({ diagnosis: diagnosis(), attempts: 2, retryLimit: 2 })).toEqual({
      retry: false,
      reason: "exhausted",
    });
    expect(
      decideRetry({
        diagnosis: diagnosis({ suggestion: { adjust: ["needs-human"], retryMessage: "" } }),
        attempts: 0,
        retryLimit: 2,
      }),
    ).toEqual({ retry: false, reason: "needs-human" });
    expect(decideRetry({ diagnosis: undefined, attempts: 0, retryLimit: 2 })).toEqual({
      retry: false,
      reason: "no-diagnosis",
    });
  });
});

describe("证据包与重试消息", () => {
  it("组装证据包：只带该 worker 的事件、note 摘要、jsonl 尾部与 git status", () => {
    const pack = buildTimeoutEvidence({
      worker: "plan::01",
      planRef: "etf/active/示例",
      kind: "plan",
      note: "01",
      notes: ["01", "02"],
      threshold: 1_800_000,
      elapsedMs: 1_900_000,
      lastProgressAt: "2026-11-07T00:00:00.000Z",
      lastReport: { note: "01", outcome: "done", summary: "还在跑" },
      noteDocument: {
        id: "01",
        title: "改造派工",
        status: "in_progress",
        content: "很长的正文",
      },
      events: [
        event(1, "input.sent", { worker: "plan::01", kind: "message", text: "做 01" }),
        event(2, "report.filed", {
          worker: "别家",
          note: "02",
          outcome: "done",
          summary: "别人的",
        }),
        event(3, "report.filed", {
          worker: "plan::01",
          note: "01",
          outcome: "done",
          summary: "还在跑",
        }),
      ],
      sessionPath: "ignored.jsonl",
      cwd: "/tmp/nowhere",
      worktree: "note-01",
      readTail: () => ["message/user: 做 01", "tool/bash: pnpm test"],
      gitStatus: () => "M src/a.ts",
    });
    expect(pack).toMatchObject({
      worker: "plan::01",
      note: "01",
      notes: ["01", "02"],
      threshold: 1_800_000,
      elapsedMs: 1_900_000,
      noteState: { id: "01", title: "改造派工", status: "in_progress", excerpt: "很长的正文" },
      sessionTail: ["message/user: 做 01", "tool/bash: pnpm test"],
      gitStatus: "M src/a.ts",
      worktree: "note-01",
    });
    // 别人的事件不进证据包。
    expect(pack.events.map((item) => item.seq)).toEqual([1, 3]);
    expect(pack.events[1]?.summary).toContain("summary=还在跑");
  });

  it("诊断提示词写明只读边界与输出格式", () => {
    const text = diagnosisPrompt(
      buildTimeoutEvidence({
        worker: "plan::01",
        planRef: "etf/active/示例",
        kind: "plan",
        threshold: 1,
        elapsedMs: 2,
        lastProgressAt: "2026-11-07T00:00:00.000Z",
        events: [],
        cwd: "/tmp/nowhere",
        gitStatus: () => undefined,
      }),
    );
    expect(text).toContain("只读");
    expect(text).toContain("禁止全盘扫描");
    expect(text).toContain("retryMessage");
    expect(text).toContain("needs-human");
  });

  it("重试消息带上次原因、上次进度与“不要重复”", () => {
    const text = buildRetryMessage({
      diagnosis: diagnosis(),
      attempt: 1,
      retryLimit: 2,
      lastReport: { note: "01", outcome: "done", summary: "写完了 A 部分" },
      elapsedMinutes: 31,
    });
    expect(text).toContain("[重试 1/2]");
    expect(text).toContain("测试跑了 40 分钟");
    expect(text).toContain("写完了 A 部分");
    expect(text).toContain("change-strategy");
    expect(text).toContain("先跑单元测试");
    expect(text).toContain("不要重复已经完成的部分");
  });

  it("jsonl 尾部只留类型与首 60 字，坏行也不吞掉", async () => {
    const dir = await tempDir();
    const file = join(dir, "session.jsonl");
    await writeFile(
      file,
      [
        JSON.stringify({
          type: "message",
          message: { role: "user", content: [{ type: "text", text: "做 01" }] },
        }),
        "不是 json",
        JSON.stringify({ type: "tool", content: "x".repeat(200) }),
      ].join("\n"),
      "utf8",
    );
    const tail = readSessionTail(file, 3);
    expect(tail?.[0]).toBe("message/user: 做 01");
    expect(tail?.[1]?.startsWith("坏行:")).toBe(true);
    expect(tail?.[2]?.startsWith("tool:")).toBe(true);
    expect((tail?.[2] ?? "").length).toBeLessThanOrEqual(70);
    expect(readSessionTail(join(dir, "不存在.jsonl"), 3)).toBeUndefined();
  });

  it("会话行摘要容忍缺字段", () => {
    expect(summarizeSessionLine('{"type":"bash"}')).toBe("bash: ");
    expect(summarizeSessionLine("   ")).toBe("");
  });
});
