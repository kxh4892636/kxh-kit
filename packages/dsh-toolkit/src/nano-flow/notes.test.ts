import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  buildNotesSnapshot,
  listActivePlans,
  NOTES_EVENT,
  NOTES_PROJECTION_KEY,
  readPanelNotes,
  resolveBoundPlan,
} from "./notes.js";
import { createNotesPanel, notesProjection } from "./notes-panel.js";

const roots: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "nano-flow-notes-"));
  roots.push(root);
  return root;
};

const noteBody = (name: string, status: string, description: string): string =>
  [
    "---",
    `name: '${name}'`,
    `description: '${description}'`,
    `status: ${status}`,
    "---",
    "",
    `# ${name}`,
    "",
  ].join("\n");

const writeNote = async (
  root: string,
  plan: string,
  file: string,
  status: string,
  description = `${file} 概述`,
): Promise<void> => {
  const directory = join(root, ".agents", "domains", "dsh", "plans", "active", plan);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, file),
    noteBody(file.replace(/\.md$/u, ""), status, description),
    "utf8",
  );
};

const planDirectory = (root: string, plan: string): string =>
  join(root, ".agents", "domains", "dsh", "plans", "active", plan);

describe("readPanelNotes", () => {
  it("keeps only unfinished notes, sorted by file name", async () => {
    const root = await makeRoot();
    const plan = "2026-11-08-演示";
    await writeNote(root, plan, "002-第二个.md", "in_progress");
    await writeNote(root, plan, "001-第一个.md", "pending");
    await writeNote(root, plan, "003-完成.md", "completed");
    await writeNote(root, plan, "004-阻塞.md", "blocked");
    await writeFile(join(planDirectory(root, plan), "spec.md"), "# spec\n", "utf8");

    const notes = readPanelNotes(planDirectory(root, plan));
    expect(notes.map((note) => note.name)).toEqual(["001-第一个", "002-第二个", "004-阻塞"]);
    expect(notes.map((note) => note.status)).toEqual(["pending", "in_progress", "blocked"]);
    expect(notes[0]?.description).toBe("001-第一个.md 概述");
  });

  it("returns an empty list for a missing directory", async () => {
    const root = await makeRoot();
    expect(readPanelNotes(join(root, "missing"))).toEqual([]);
  });
});

describe("buildNotesSnapshot", () => {
  it("returns the plan name, relative path and unfinished notes", async () => {
    const root = await makeRoot();
    const plan = "2026-11-08-演示";
    await writeNote(root, plan, "001-第一个.md", "pending");
    const snapshot = buildNotesSnapshot(root, planDirectory(root, plan));
    expect(snapshot).toEqual({
      planName: plan,
      planPath: `.agents/domains/dsh/plans/active/${plan}`,
      notes: [{ name: "001-第一个", status: "pending", description: "001-第一个.md 概述" }],
    });
  });

  it("returns null when every note is completed", async () => {
    const root = await makeRoot();
    const plan = "2026-11-08-演示";
    await writeNote(root, plan, "001-完成.md", "completed");
    expect(buildNotesSnapshot(root, planDirectory(root, plan))).toBeNull();
  });
});

describe("resolveBoundPlan", () => {
  it("binds the only active plan", async () => {
    const root = await makeRoot();
    await writeNote(root, "2026-11-08-唯一", "001-第一个.md", "pending");
    expect(
      resolveBoundPlan({ workspace: root, domainsDirectory: join(root, ".agents", "domains") }),
    ).toBe(planDirectory(root, "2026-11-08-唯一"));
  });

  it("refuses to pick between several active plans", async () => {
    const root = await makeRoot();
    await writeNote(root, "2026-11-08-甲", "001-甲.md", "pending");
    await writeNote(root, "2026-11-08-乙", "001-乙.md", "pending");
    expect(listActivePlans(join(root, ".agents", "domains"))).toHaveLength(2);
    expect(
      resolveBoundPlan({ workspace: root, domainsDirectory: join(root, ".agents", "domains") }),
    ).toBeUndefined();
  });

  it("keeps an existing binding and drops one whose plan moved away", async () => {
    const root = await makeRoot();
    await writeNote(root, "2026-11-08-甲乙", "001-甲.md", "pending");
    const bound = planDirectory(root, "2026-11-08-甲乙");
    expect(
      resolveBoundPlan({
        workspace: root,
        domainsDirectory: join(root, ".agents", "domains"),
        boundPlanPath: bound,
      }),
    ).toBe(bound);
    await rm(bound, { recursive: true, force: true });
    expect(
      resolveBoundPlan({
        workspace: root,
        domainsDirectory: join(root, ".agents", "domains"),
        boundPlanPath: bound,
      }),
    ).toBeUndefined();
  });
});

describe("notesProjection", () => {
  it("keeps the state unless the snapshot event arrives", () => {
    expect(notesProjection.key).toBe(NOTES_PROJECTION_KEY);
    expect(notesProjection.init()).toBeNull();
    const snapshot = { planName: "p", planPath: "p", notes: [] };
    expect(notesProjection.apply(null, { type: "turn/start" })).toBeNull();
    expect(notesProjection.apply(null, { type: NOTES_EVENT, data: snapshot })).toEqual(snapshot);
  });
});

describe("createNotesPanel", () => {
  const agentOf = (root: string) => {
    const append = vi.fn();
    const agent = { session: { header: { cwd: root }, append } };
    return { agent, append };
  };

  it("writes the snapshot once and dedupes unchanged refreshes", async () => {
    const root = await makeRoot();
    await writeNote(root, "2026-11-08-演示", "001-第一个.md", "pending");
    const panel = createNotesPanel({
      domainRoot: ".agents/domains",
      logger: { warn: () => {} },
    });
    const { agent, append } = agentOf(root);
    panel.refresh(agent);
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0]?.[0]).toBe(NOTES_EVENT);
    panel.refresh(agent);
    expect(append).toHaveBeenCalledTimes(1);
    panel.dispose();
  });

  it("stays silent while the session has no displayable notes", async () => {
    const root = await makeRoot();
    await writeNote(root, "2026-11-08-演示", "001-完成.md", "completed");
    const panel = createNotesPanel({
      domainRoot: ".agents/domains",
      logger: { warn: () => {} },
    });
    const { agent, append } = agentOf(root);
    panel.refresh(agent);
    expect(append).not.toHaveBeenCalled();
    panel.dispose();
  });

  it("rewrites the snapshot when a note changes, and polls on the timer", async () => {
    vi.useFakeTimers();
    const root = await makeRoot();
    await writeNote(root, "2026-11-08-演示", "001-第一个.md", "pending");
    const panel = createNotesPanel({
      domainRoot: ".agents/domains",
      refreshMs: 1_000,
      logger: { warn: () => {} },
    });
    const { agent, append } = agentOf(root);
    panel.attach(agent);
    panel.refresh(agent);
    expect(append).toHaveBeenCalledTimes(1);
    await writeNote(root, "2026-11-08-演示", "001-第一个.md", "completed");
    vi.advanceTimersByTime(1_000);
    expect(append).toHaveBeenCalledTimes(2);
    expect(append.mock.calls[1]?.[1]).toBeNull();
    panel.dispose();
  });

  it("stops polling after dispose", async () => {
    vi.useFakeTimers();
    const root = await makeRoot();
    await writeNote(root, "2026-11-08-演示", "001-第一个.md", "pending");
    const panel = createNotesPanel({ domainRoot: ".agents/domains", logger: { warn: () => {} } });
    const { agent, append } = agentOf(root);
    panel.attach(agent);
    panel.refresh(agent);
    panel.dispose();
    await writeNote(root, "2026-11-08-演示", "001-第一个.md", "blocked");
    vi.advanceTimersByTime(10_000);
    expect(append).toHaveBeenCalledTimes(1);
  });
});
