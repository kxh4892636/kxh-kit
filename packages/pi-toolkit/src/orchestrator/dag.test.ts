import { describe, expect, it } from "vite-plus/test";

import {
  graphOf,
  nextNoteId,
  parseDocument,
  planStatusOf,
  readyNotes,
  searchNotes,
  serializeDocument,
  todoGroups,
  type NoteNode,
} from "./dag.ts";
import type { OrchestratorSettings } from "./config.ts";

const limits: OrchestratorSettings = {
  storyMaxBytes: 34816,
  specMaxBytes: 34816,
  noteMaxBytes: 13312,
  noteDescriptionMaxChars: 144,
  indexMaxRows: 13,
  contextMaxBytes: 91136,
  questionsMaxBytes: 91136,
  adrMaxBytes: 13312,
  adrMaxCount: 55,
  rotateAt: 0.9,
  workerTimeoutMs: 1_800_000,
  wakeOnReport: false,
};

const note = (overrides: Partial<NoteNode> = {}): NoteNode => ({
  id: "01",
  title: "示例",
  description: "一句话摘要",
  status: "pending",
  blocked_by: [],
  evidence: [],
  updated_at: "2026-11-06T00:00:00.000Z",
  content: "正文",
  ...overrides,
});

const raw = (notes: NoteNode[], index: string[] = []) => ({ version: 1, index, notes });

describe("parseDocument", () => {
  it("接受合法文档并按 id 排序", () => {
    const document = parseDocument(raw([note({ id: "02" }), note({ id: "01" })]), limits);
    expect(document.version).toBe(1);
    expect(document.notes.map((item) => item.id)).toEqual(["01", "02"]);
  });

  it("拒绝重复 id", () => {
    expect(() => parseDocument(raw([note(), note()]), limits)).toThrow(/id 重复/);
  });

  it("拒绝引用不存在的依赖", () => {
    expect(() => parseDocument(raw([note({ blocked_by: ["09"] })]), limits)).toThrow(
      /依赖不存在的 note 09/,
    );
  });

  it("拒绝环", () => {
    const notes = [note({ id: "01", blocked_by: ["02"] }), note({ id: "02", blocked_by: ["01"] })];
    expect(() => parseDocument(raw(notes), limits)).toThrow(/存在环/);
  });

  it("要求 completed 带 evidence", () => {
    expect(() => parseDocument(raw([note({ status: "completed" })]), limits)).toThrow(
      /缺少 evidence/,
    );
    expect(() =>
      parseDocument(raw([note({ status: "completed", evidence: ["pnpm test 通过"] })]), limits),
    ).not.toThrow();
  });

  it("in_progress 的直接依赖必须已完成", () => {
    const notes = [
      note({ id: "01" }),
      note({ id: "02", status: "in_progress", blocked_by: ["01"] }),
    ];
    expect(() => parseDocument(raw(notes), limits)).toThrow(/尚未 completed/);
  });

  it("blocked 的直接依赖必须已完成", () => {
    const notes = [
      note({ id: "01" }),
      note({
        id: "02",
        status: "blocked",
        blocked_by: ["01"],
        blocked_reason: "等外部确认",
      }),
    ];
    expect(() => parseDocument(raw(notes), limits)).toThrow(/尚未 completed/);
  });

  it("blocked 必须写原因", () => {
    expect(() => parseDocument(raw([note({ status: "blocked" })]), limits)).toThrow(
      /必须写 blocked_reason/,
    );
  });

  it("接受 waiting，且其直接依赖必须已完成", () => {
    expect(
      parseDocument(raw([note({ status: "waiting", needs: "review" })]), limits).notes[0]?.status,
    ).toBe("waiting");
    expect(() =>
      parseDocument(
        raw([
          note({ id: "01" }),
          note({ id: "02", status: "waiting", needs: "review", blocked_by: ["01"] }),
        ]),
        limits,
      ),
    ).toThrow(/尚未 completed/);
  });

  it("waiting 缺 needs 时拒绝，needs 取值受限", () => {
    expect(() => parseDocument(raw([note({ status: "waiting" as never })]), limits)).toThrow(
      /必须给 needs/,
    );
    expect(() =>
      parseDocument(raw([note({ status: "waiting", needs: "later" as never })]), limits),
    ).toThrow(/needs 必须是 answer \| review/);
  });

  it("旧文档的 awaiting_verification 折成 waiting + needs=review", () => {
    const legacy = {
      version: 1,
      index: [],
      notes: [{ ...note({}), status: "awaiting_verification" }],
    };
    const parsed = parseDocument(legacy, limits);
    expect(parsed.notes[0]?.status).toBe("waiting");
    expect(parsed.notes[0]?.needs).toBe("review");
    expect(JSON.parse(serializeDocument(parsed)).notes[0].status).toBe("waiting");
  });

  it("拒绝超长 note 正文", () => {
    const tight = { ...limits, noteMaxBytes: 4 };
    expect(() => parseDocument(raw([note({ content: "中文" })]), tight)).toThrow(/超过 4/);
  });

  it("拒绝超长摘要", () => {
    const tight = { ...limits, noteDescriptionMaxChars: 2 };
    expect(() => parseDocument(raw([note({ description: "三个字" })]), tight)).toThrow(/超过 2 字/);
  });

  it("校验索引", () => {
    expect(() => parseDocument(raw([note()], ["09"]), limits)).toThrow(/不存在的 note 09/);
    expect(() => parseDocument(raw([note()], ["01", "01"]), limits)).toThrow(/index 重复/);
    const tight = { ...limits, indexMaxRows: 1 };
    expect(() =>
      parseDocument(raw([note({ id: "01" }), note({ id: "02" })], ["01", "02"]), tight),
    ).toThrow(/超过 1/);
  });
});

describe("查询", () => {
  const notes = [
    note({ id: "01", status: "completed", evidence: ["完成"] }),
    note({ id: "02", blocked_by: ["01"] }),
    note({ id: "03", blocked_by: ["02"] }),
  ];

  it("readyNotes 只给依赖已完成的 pending", () => {
    expect(readyNotes(notes).map((item) => item.id)).toEqual(["02"]);
    expect(
      readyNotes([note({ id: "01", status: "waiting", needs: "review" })]).map((item) => item.id),
    ).toEqual([]);
  });

  it("todoGroups 把等待验证排在同层可执行项之后、blocked 之前", () => {
    const grouped = [
      note({ id: "01", status: "completed", evidence: ["完成"] }),
      note({ id: "02", blocked_by: ["01"] }),
      note({ id: "03", status: "waiting", needs: "review", blocked_by: ["01"] }),
      note({ id: "04", status: "blocked", blocked_by: ["01"], blocked_reason: "等外部确认" }),
      note({ id: "05", blocked_by: ["02", "03", "04"] }),
    ];
    expect(todoGroups(grouped).map((group) => group.notes.map((item) => item.id))).toEqual([
      ["02", "03", "04", "05"],
    ]);
  });

  it("todoGroups 把有依赖关系的 note 分到同一组并按拓扑排序", () => {
    const grouped = [
      note({ id: "01", status: "completed", evidence: ["完成"] }),
      note({ id: "02" }),
      note({ id: "03", status: "in_progress", blocked_by: ["01"] }),
      note({ id: "04", blocked_by: ["02", "03"] }),
      note({ id: "05", blocked_by: ["02"] }),
      note({ id: "06", status: "blocked", blocked_reason: "等外部确认" }),
    ];
    expect(todoGroups(grouped).map((group) => group.notes.map((item) => item.id))).toEqual([
      ["02", "03", "04", "05"],
      ["06"],
    ]);

    const chain = [
      note({ id: "01" }),
      note({ id: "02", blocked_by: ["01"] }),
      note({ id: "03", blocked_by: ["02"] }),
    ];
    expect(todoGroups(chain).map((group) => group.notes.map((item) => item.id))).toEqual([
      ["01", "02", "03"],
    ]);

    const forks = [
      note({ id: "01" }),
      note({ id: "02", blocked_by: ["01"] }),
      note({ id: "03" }),
      note({ id: "04", blocked_by: ["03"] }),
    ];
    expect(todoGroups(forks).map((group) => group.notes.map((item) => item.id))).toEqual([
      ["01", "02"],
      ["03", "04"],
    ]);
    expect(todoGroups([note({ status: "completed", evidence: ["完成"] })])).toEqual([]);
  });

  it("planStatusOf 按全部 note 派生，等待验证算未完成", () => {
    expect(planStatusOf([])).toBe("pending");
    expect(planStatusOf([note()])).toBe("pending");
    expect(planStatusOf([note({ status: "completed" }), note({ id: "02" })])).toBe("in_progress");
    expect(planStatusOf([note({ status: "waiting", needs: "review" })])).toBe("in_progress");
    expect(
      planStatusOf([
        note({ id: "01", status: "completed", evidence: ["完成"] }),
        note({ id: "02", status: "waiting", needs: "review" }),
      ]),
    ).toBe("in_progress");
    expect(planStatusOf([note({ status: "completed" })])).toBe("completed");
  });

  it("graphOf 返回传递上下游", () => {
    expect(graphOf(notes, "02")).toMatchObject({ upstream: ["01"], downstream: ["03"] });
  });

  it("searchNotes 命中标题、摘要与正文", () => {
    const hits = searchNotes(
      [
        note({ id: "01", title: "预设" }),
        note({ id: "02", description: "工具注册" }),
        note({ id: "03", content: "校验脚本" }),
      ],
      "注册",
    );
    expect(hits.map((item) => item.id)).toEqual(["02"]);
  });

  it("nextNoteId 取未用 id", () => {
    expect(nextNoteId([])).toBe("01");
    expect(nextNoteId([note({ id: "03" })])).toBe("04");
  });

  it("serializeDocument 稳定且可回读", () => {
    const document = parseDocument(raw([note()], ["01"]), limits);
    const text = serializeDocument(document);
    expect(text.endsWith("\n")).toBe(true);
    expect(parseDocument(JSON.parse(text), limits).notes[0]?.id).toBe("01");
  });
});
