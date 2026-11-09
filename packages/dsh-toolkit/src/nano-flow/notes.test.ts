import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { buildNotesSnapshot, readPanelNotes } from "./notes.js";

const roots: string[] = [];

afterEach(async () => {
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
