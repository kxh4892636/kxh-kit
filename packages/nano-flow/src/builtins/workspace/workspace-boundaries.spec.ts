import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { channel } from "node:diagnostics_channel";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { InvocationContext } from "../../cli/types";
import {
  isWorkspaceRelativePath,
  loadWorkspaceFile,
  prepareAddRepository,
  prepareRemoveRepository,
  prepareUpdateRepository,
  resolveRepositoryPath,
  WORKSPACE_CONFIG_FILE,
  WorkspaceConfigError,
  type RepositoryDraft,
} from "./workspace-config";
import { assertPhysicalPathWithinRoot, normalizeFsPath, pathExists } from "./workspace-path";
import { errorDetail, errorMessage, hasErrorCode } from "./workspace-error";
import { statusRepositories } from "./workspace-repository";
import {
  listWorkspaceWorktrees,
  prepareWorkspaceAdd,
  prepareWorkspaceSwitch,
} from "./workspace-worktree";

const directories: string[] = [];
const createRoot = async (content: string = "repositories: []\n"): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), "nf-workspace-boundary-"));
  directories.push(root);
  await writeFile(path.join(root, WORKSPACE_CONFIG_FILE), content, "utf8");
  return root;
};
const draft = (overrides: Partial<RepositoryDraft> = {}): RepositoryDraft => ({
  name: "alpha",
  url: "https://example.com/alpha.git",
  path: "apps/alpha",
  branch: "main",
  ...overrides,
});
const context = (cwd: string): InvocationContext => ({
  cwd,
  env: {},
  signal: new AbortController().signal,
  stdin: { readLine: async (): Promise<null> => null },
  debug: false,
  dryRun: false,
});
const captureError = async (operation: Promise<unknown>): Promise<Error> => {
  try {
    await operation;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`Expected Error, received ${String(error)}`);
  }
  throw new Error("Expected operation to reject");
};

afterEach(async (): Promise<void> => {
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((directory: string) => rm(directory, { force: true, recursive: true })),
  );
});

describe("workspace configuration boundaries", (): void => {
  test("constructs workspace errors with the complete public shape", (): void => {
    const error = new WorkspaceConfigError("failure", {
      hint: "retry",
      details: { name: "alpha", count: 2 },
    });
    expect({
      name: error.name,
      message: error.message,
      hint: error.hint,
      details: error.details,
    }).toStrictEqual({
      name: "WorkspaceConfigError",
      message: "failure",
      hint: "retry",
      details: { name: "alpha", count: 2 },
    });
  });

  test("normalizes workspace errors and error codes", (): void => {
    expect(errorMessage(new Error("failure"))).toBe("failure");
    expect(errorMessage("failure")).toBe("failure");
    expect(errorMessage(null)).toBe("null");
    expect(errorDetail({ stderr: "  git failure  " })).toBe("git failure");
    expect(errorDetail({ stderr: "   " })).toBe("[object Object]");
    expect(errorDetail({ stderr: 1 })).toBe("[object Object]");
    expect(errorDetail({})).toBe("[object Object]");
    expect(errorDetail(null)).toBe("null");
    expect(errorDetail("plain")).toBe("plain");
    expect(errorDetail(new Error("fallback"))).toBe("fallback");
    expect(hasErrorCode({ code: "ENOENT" }, "ENOENT", "ENOTDIR")).toBe(true);
    expect(hasErrorCode({ code: 1 }, 1)).toBe(true);
    expect(hasErrorCode({ code: "OTHER" }, "ENOENT")).toBe(false);
    expect(hasErrorCode({}, "ENOENT")).toBe(false);
    expect(hasErrorCode(null, "ENOENT")).toBe(false);
    expect(hasErrorCode("ENOENT", "ENOENT")).toBe(false);
  });

  test.each([
    ["", false],
    ["/absolute", false],
    ["\\absolute", false],
    ["C:relative", false],
    ["apps/../other", false],
    ["apps\\..\\other", false],
    [".", false],
    ["apps/C:relative", true],
    ["apps\\repo", true],
    ["apps/repo", true],
  ])("classifies workspace relative path %j", (value: string, expected: boolean): void => {
    expect(isWorkspaceRelativePath(value)).toBe(expected);
  });

  test("preserves repository path case off Windows", async (): Promise<void> => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    const root = await createRoot(`repositories:
  - name: one
    url: https://example.com/one.git
    path: Apps/Repo
    branch: main
  - name: two
    url: https://example.com/two.git
    path: apps/repo
    branch: main
`);
    await expect(loadWorkspaceFile(root)).resolves.toMatchObject({
      repositories: [{ name: "one" }, { name: "two" }],
    });
  });

  test("rejects repository paths that differ only in case on Windows", async (): Promise<void> => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const root = await createRoot(`repositories:
  - name: one
    url: https://example.com/one.git
    path: Apps/Repo
    branch: main
  - name: two
    url: https://example.com/two.git
    path: apps/repo
    branch: main
`);
    await expect(loadWorkspaceFile(root)).rejects.toMatchObject({
      name: "WorkspaceConfigError",
      message: `Invalid ${path.join(root, WORKSPACE_CONFIG_FILE)}`,
      details: { issues: ["repositories.1.path: duplicate repository path: apps/repo"] },
    });
  });

  test.each(["", "null\n"])(
    "defaults a blank workspace document %j",
    async (content): Promise<void> => {
      const root = await createRoot(content);
      await expect(loadWorkspaceFile(root)).resolves.toMatchObject({ repositories: [] });
    },
  );

  test("reports malformed YAML", async (): Promise<void> => {
    const root = await createRoot("repositories: [\n");
    const events: unknown[] = [];
    const diagnostics = channel("nnf.workspace");
    const subscriber = (event: unknown): void => void events.push(event);
    diagnostics.subscribe(subscriber);
    try {
      await expect(loadWorkspaceFile(root)).rejects.toMatchObject({
        name: "WorkspaceConfigError",
        message: expect.stringMatching(/^Failed to read .+workspace\.yaml:/u),
        details: undefined,
        hint: undefined,
      });
      expect(events).toStrictEqual([
        { level: "error", message: expect.stringContaining("Flow sequence in block collection") },
      ]);
    } finally {
      diagnostics.unsubscribe(subscriber);
    }
  });
});

describe("workspace configuration boundaries", (): void => {
  test.each(["scalar\n", "repositories: wrong\n"])(
    "reports root-level invalid workspace documents %j",
    async (content: string): Promise<void> => {
      const root = await createRoot(content);
      await expect(loadWorkspaceFile(root)).rejects.toMatchObject({
        details: { issues: expect.any(Array) },
      });
    },
  );

  test("formats a root schema issue exactly", async (): Promise<void> => {
    const root = await createRoot("scalar\n");
    await expect(loadWorkspaceFile(root)).rejects.toMatchObject({
      name: "WorkspaceConfigError",
      message: `Invalid ${path.join(root, WORKSPACE_CONFIG_FILE)}`,
      details: { issues: [expect.stringMatching(/^\(root\):/u)] },
    });
  });

  test("rejects URL matches with extra leading or trailing text", async (): Promise<void> => {
    for (const url of [
      "prefixhttps://example.com/alpha.git",
      "https://example.com/alpha.git trailing",
    ]) {
      const root = await createRoot();
      const error = await captureError(prepareAddRepository(root, draft({ url })));
      expect(error).toMatchObject({
        name: "WorkspaceConfigError",
        message: "Invalid repository 'alpha'",
        details: {
          issues: ["url: url must be an ssh (git@host:path or ssh://), http(s) or file url"],
        },
      });
    }
  });

  test("rejects malformed YAML through the editable document boundary", async (): Promise<void> => {
    const root = await createRoot("repositories: [\n");
    await expect(prepareAddRepository(root, draft())).rejects.toMatchObject({
      name: "WorkspaceConfigError",
      message: expect.stringMatching(/^Failed to read .+workspace\.yaml:/u),
      details: undefined,
      hint: undefined,
    });
  });

  test("reports filesystem read errors", async (): Promise<void> => {
    const root = await createRoot();
    const config = path.join(root, WORKSPACE_CONFIG_FILE);
    await rm(config);
    await mkdir(config);
    await expect(loadWorkspaceFile(root)).rejects.toThrow("Failed to read");
  });

  test("adds to a document without an explicit repository sequence", async (): Promise<void> => {
    const root = await createRoot("# empty workspace\n");
    const prepared = await prepareAddRepository(root, draft());
    expect(prepared.change).toBe("added");
    await prepared.commit();
    expect((await loadWorkspaceFile(root)).repositories).toHaveLength(1);
  });

  test.each([
    { name: "", title: "empty name" },
    { url: "ftp://example.com/a.git", title: "bad url" },
    { path: "../outside", title: "bad path" },
    { branch: "", title: "empty branch" },
  ])("rejects an invalid draft with $title", async (patch): Promise<void> => {
    const root = await createRoot();
    await expect(prepareAddRepository(root, draft(patch))).rejects.toMatchObject({
      message: expect.stringContaining("Invalid repository"),
    });
  });

  test("rejects duplicate names and conflicting paths", async (): Promise<void> => {
    const root = await createRoot();
    const first = await prepareAddRepository(root, draft());
    await first.commit();
    await expect(prepareAddRepository(root, draft())).rejects.toThrow("already exists");
    await expect(
      prepareAddRepository(root, draft({ name: "beta", url: "https://example.com/beta.git" })),
    ).rejects.toThrow("already used");
  });

  test("rejects update of an unknown repository", async (): Promise<void> => {
    const root = await createRoot();
    await expect(prepareUpdateRepository(root, "missing", {})).rejects.toThrow("not found");
  });
});

describe("workspace configuration boundaries", (): void => {
  test("updates no fields or every field", async (): Promise<void> => {
    const root = await createRoot();
    await (await prepareAddRepository(root, draft())).commit();
    const unchanged = await prepareUpdateRepository(root, "alpha", {});
    expect(unchanged.repository).toEqual(draft());
    await unchanged.commit();
    const updated = await prepareUpdateRepository(root, "alpha", {
      url: "ssh://example.com/new.git",
      path: "libs/new",
      branch: "dev",
    });
    expect(updated).toMatchObject({
      root,
      config: path.join(root, WORKSPACE_CONFIG_FILE),
      change: "updated",
      repository: {
        name: "alpha",
        url: "ssh://example.com/new.git",
        path: "libs/new",
        branch: "dev",
      },
    });
    await updated.commit();
    await expect(loadWorkspaceFile(root)).resolves.toStrictEqual({
      root,
      repositories: [
        {
          name: "alpha",
          url: "ssh://example.com/new.git",
          path: "libs/new",
          branch: "dev",
        },
      ],
    });
  });

  test("rejects updates and removal of materialized repositories", async (): Promise<void> => {
    const root = await createRoot();
    await (await prepareAddRepository(root, draft())).commit();
    await mkdir(path.join(root, "apps", "alpha", ".git"), { recursive: true });
    await expect(prepareUpdateRepository(root, "alpha", {})).rejects.toThrow("materialized");
    await expect(prepareRemoveRepository(root, "alpha")).rejects.toThrow("materialized");
  });

  test("rejects an update path occupied by another materialized directory", async (): Promise<void> => {
    const root = await createRoot();
    await (await prepareAddRepository(root, draft())).commit();
    await mkdir(path.join(root, "apps", "occupied", ".git"), { recursive: true });
    const occupiedPath = path.join(root, "apps", "occupied");
    await expect(
      prepareUpdateRepository(root, "alpha", { path: "apps/occupied" }),
    ).rejects.toMatchObject({
      name: "WorkspaceConfigError",
      message: `Repository is materialized at ${occupiedPath}`,
      details: { name: "alpha", path: occupiedPath },
      hint: "Choose an unused --path for the repository configuration",
    });
  });

  test("normalizes atomic write failures", async (): Promise<void> => {
    const root = await createRoot();
    const prepared = await prepareAddRepository(root, draft());
    const config = path.join(root, WORKSPACE_CONFIG_FILE);
    await rm(config);
    await mkdir(config);
    await expect(prepared.commit()).rejects.toThrow("Failed to write");
  });

  test("resolves repository paths from the workspace root", (): void => {
    expect(resolveRepositoryPath("C:/workspace", draft()).toLowerCase()).toContain("workspace");
  });
});

describe("workspace path boundaries", (): void => {
  test("returns true, ENOENT false, and ENOTDIR false", async (): Promise<void> => {
    const root = await createRoot();
    await expect(pathExists(root)).resolves.toBe(true);
    await expect(pathExists(path.join(root, "missing"))).resolves.toBe(false);
    const file = path.join(root, "file.txt");
    await writeFile(file, "x");
    await expect(pathExists(path.join(file, "child"))).resolves.toBe(false);
  });

  test("normalizes case according to the active platform", (): void => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    expect(normalizeFsPath(" C:\\Work\\Repo\\ ")).toBe("c:/work/repo");
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    expect(normalizeFsPath(" C:\\Work\\Repo\\ ")).toContain("C:/Work/Repo");
  });

  test("accepts an existing or not-yet-created path inside the root", async (): Promise<void> => {
    const root = await createRoot();
    await mkdir(path.join(root, "inside"));
    await expect(
      assertPhysicalPathWithinRoot(root, path.join(root, "inside")),
    ).resolves.toBeUndefined();
    await expect(
      assertPhysicalPathWithinRoot(root, path.join(root, "inside", "future", "child")),
    ).resolves.toBeUndefined();
  });

  test("rejects a physical link that escapes the root", async (): Promise<void> => {
    const root = await createRoot();
    const outside = await mkdtemp(path.join(tmpdir(), "nf-workspace-outside-"));
    directories.push(outside);
    const link = path.join(root, "escape");
    await symlink(outside, link, "junction");
    await expect(assertPhysicalPathWithinRoot(root, link)).rejects.toBeInstanceOf(
      WorkspaceConfigError,
    );
  });
});

describe("workspace repository and worktree public boundaries", (): void => {
  test("rejects unknown repository selections in status and worktree listing", async (): Promise<void> => {
    const root = await createRoot();
    for (const operation of [
      (): Promise<unknown> => statusRepositories(["missing"], context(root)),
      (): Promise<unknown> => listWorkspaceWorktrees(["missing"], context(root)),
    ]) {
      const error = await captureError(operation());
      expect(error).toBeInstanceOf(WorkspaceConfigError);
      expect(error.message).toBe("Repository not found in workspace.yaml: missing");
      expect((error as WorkspaceConfigError).details).toEqual({ name: "missing" });
      expect((error as WorkspaceConfigError).hint).toBeUndefined();
    }
  });

  test("rejects invalid, unknown, and unmaterialized worktree additions", async (): Promise<void> => {
    const root = await createRoot();
    const invalidPath = await captureError(
      prepareWorkspaceAdd({ name: "alpha", path: "../outside" }, context(root)),
    );
    expect(invalidPath.message).toBe(
      "--path must be relative to the workspace root and must not contain '..'",
    );
    const unknown = await captureError(
      prepareWorkspaceAdd({ name: "missing", path: "trees/missing" }, context(root)),
    );
    expect(unknown.message).toBe("Repository not found in workspace.yaml: missing");
    expect((unknown as WorkspaceConfigError).details).toEqual({ name: "missing" });
    await (await prepareAddRepository(root, draft())).commit();
    const unmaterialized = await captureError(
      prepareWorkspaceAdd({ name: "alpha", path: "trees/alpha" }, context(root)),
    );
    expect(unmaterialized.message).toBe("Repository is not materialized: alpha");
    expect((unmaterialized as WorkspaceConfigError).hint).toBe(
      "Run 'nnf workspace repository clone --name alpha' first",
    );
    expect((unmaterialized as WorkspaceConfigError).details).toEqual({
      name: "alpha",
      path: path.join(root, "apps", "alpha"),
    });
  });

  test("rejects the primary clone and an occupied worktree target", async (): Promise<void> => {
    const root = await createRoot();
    await (await prepareAddRepository(root, draft())).commit();
    await mkdir(path.join(root, "apps", "alpha", ".git"), { recursive: true });
    const primary = await captureError(
      prepareWorkspaceAdd({ name: "alpha", path: "apps/alpha" }, context(root)),
    );
    expect(primary.message).toBe(
      `Cannot add a worktree at the primary clone: ${path.join(root, "apps", "alpha")}`,
    );
    expect((primary as WorkspaceConfigError).details).toBeUndefined();
    await mkdir(path.join(root, "trees", "alpha"), { recursive: true });
    const occupied = await captureError(
      prepareWorkspaceAdd({ name: "alpha", path: "trees/alpha" }, context(root)),
    );
    expect(occupied.message).toBe(
      `Worktree target already exists: ${path.join(root, "trees", "alpha")}`,
    );
    expect((occupied as WorkspaceConfigError).details).toEqual({
      name: "alpha",
      path: path.join(root, "trees", "alpha"),
    });
  });

  test("rejects switching an unmaterialized repository", async (): Promise<void> => {
    const root = await createRoot();
    await (await prepareAddRepository(root, draft())).commit();
    const error = await captureError(
      prepareWorkspaceSwitch(
        { name: "alpha", path: "trees/alpha", branch: "feature" },
        context(root),
      ),
    );
    expect(error.message).toBe("Repository is not materialized: alpha");
    expect((error as WorkspaceConfigError).hint).toBe(
      "Run 'nnf workspace repository clone --name alpha' first",
    );
    expect((error as WorkspaceConfigError).details).toEqual({
      name: "alpha",
      path: path.join(root, "apps", "alpha"),
    });
  });
});
