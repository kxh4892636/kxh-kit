import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  loadWorkspaceConfig,
  planRemove,
  planUpsert,
  prepareRemoveRepository,
  prepareUpsertRepository,
  WORKSPACE_CONFIG_FILE,
  WORKSPACE_LOCAL_FILE,
  WorkspaceConfigError,
  type RepositoryDraft,
  type WorkspaceRepository,
} from "./workspace-config";

const temporaryDirectories: string[] = [];

const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "loopx-workspace-config-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async (): Promise<void> => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory: string): Promise<void> => rm(directory, { force: true, recursive: true })),
  );
});

const VALID_CONFIG = `repositories:
  - name: kxh-kit
    url: git@github.com:kxh4892636/kxh-kit.git
    path: apps/kxh-kit
    branch: main
`;

describe("loadWorkspaceConfig", (): void => {
  test("locates the workspace root from a nested subdirectory", async (): Promise<void> => {
    const root = await createDirectory();
    const nested = path.join(root, "apps", "kxh-kit", "src");
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, WORKSPACE_CONFIG_FILE), VALID_CONFIG, "utf8");
    const config = await loadWorkspaceConfig(nested);
    expect(config).toEqual({
      root,
      repositories: [
        {
          name: "kxh-kit",
          url: "git@github.com:kxh4892636/kxh-kit.git",
          path: "apps/kxh-kit",
          branch: "main",
        },
      ],
    });
  });

  test("fails with an init hint when no workspace.yaml exists", async (): Promise<void> => {
    const directory = await createDirectory();
    const failure = await loadWorkspaceConfig(directory).catch((error: unknown): unknown => error);
    expect(failure).toBeInstanceOf(WorkspaceConfigError);
    expect((failure as WorkspaceConfigError).message).toContain(WORKSPACE_CONFIG_FILE);
    expect((failure as WorkspaceConfigError).hint).toContain("init");
  });

  test("merges clone_path records from workspace.local.yaml", async (): Promise<void> => {
    const root = await createDirectory();
    await writeFile(path.join(root, WORKSPACE_CONFIG_FILE), VALID_CONFIG, "utf8");
    await writeFile(
      path.join(root, WORKSPACE_LOCAL_FILE),
      `repositories:
  - name: kxh-kit
    clone_path: C:/Users/kxh/workspaces/kxh-kit
`,
      "utf8",
    );
    const config = await loadWorkspaceConfig(root);
    expect(config.repositories).toEqual([
      {
        name: "kxh-kit",
        url: "git@github.com:kxh4892636/kxh-kit.git",
        path: "apps/kxh-kit",
        branch: "main",
        clonePath: "C:/Users/kxh/workspaces/kxh-kit",
      },
    ]);
  });

  test("accepts an empty repositories list", async (): Promise<void> => {
    const root = await createDirectory();
    await writeFile(path.join(root, WORKSPACE_CONFIG_FILE), "repositories: []\n", "utf8");
    const config = await loadWorkspaceConfig(root);
    expect(config.repositories).toEqual([]);
  });

  test("accepts http(s) urls", async (): Promise<void> => {
    const root = await createDirectory();
    await writeFile(
      path.join(root, WORKSPACE_CONFIG_FILE),
      `repositories:
  - name: wiki
    url: https://github.com/kxh4892636/wiki.git
    path: apps/wiki
    branch: main
`,
      "utf8",
    );
    const config = await loadWorkspaceConfig(root);
    expect(config.repositories[0]?.name).toBe("wiki");
  });

  test("rejects a workspace.local.yaml with a relative clone_path", async (): Promise<void> => {
    const root = await createDirectory();
    await writeFile(path.join(root, WORKSPACE_CONFIG_FILE), VALID_CONFIG, "utf8");
    await writeFile(
      path.join(root, WORKSPACE_LOCAL_FILE),
      `repositories:
  - name: kxh-kit
    clone_path: workspaces/kxh-kit
`,
      "utf8",
    );
    const failure = await loadWorkspaceConfig(root).catch((error: unknown): unknown => error);
    expect(failure).toBeInstanceOf(WorkspaceConfigError);
    expect((failure as WorkspaceConfigError).details?.["issues"]).toBeDefined();
  });

  test.each([
    {
      title: "duplicate name",
      document: `repositories:
  - name: kxh-kit
    url: git@github.com:kxh4892636/kxh-kit.git
    path: apps/kxh-kit
    branch: main
  - name: kxh-kit
    url: git@github.com:kxh4892636/other.git
    path: apps/other
    branch: main
`,
    },
    {
      title: "duplicate path",
      document: `repositories:
  - name: kxh-kit
    url: git@github.com:kxh4892636/kxh-kit.git
    path: apps/kxh-kit
    branch: main
  - name: other
    url: git@github.com:kxh4892636/other.git
    path: apps/kxh-kit
    branch: main
`,
    },
    {
      title: "duplicate path with different separators",
      document: `repositories:
  - name: kxh-kit
    url: git@github.com:kxh4892636/kxh-kit.git
    path: apps/kxh-kit
    branch: main
  - name: other
    url: git@github.com:kxh4892636/other.git
    path: apps\\kxh-kit
    branch: main
`,
    },
    {
      title: "url that is neither ssh nor http(s)",
      document: `repositories:
  - name: kxh-kit
    url: ftp://github.com/kxh4892636/kxh-kit.git
    path: apps/kxh-kit
    branch: main
`,
    },
    {
      title: "absolute path",
      document: `repositories:
  - name: kxh-kit
    url: git@github.com:kxh4892636/kxh-kit.git
    path: /abs/kxh-kit
    branch: main
`,
    },
    {
      title: "path escaping the workspace root",
      document: `repositories:
  - name: kxh-kit
    url: git@github.com:kxh4892636/kxh-kit.git
    path: apps/../kxh-kit
    branch: main
`,
    },
    {
      title: "drive-relative path",
      document: `repositories:
  - name: kxh-kit
    url: git@github.com:kxh4892636/kxh-kit.git
    path: C:outside
    branch: main
`,
    },
  ])("rejects a config with $title", async ({ document }: { document: string }): Promise<void> => {
    const root = await createDirectory();
    await writeFile(path.join(root, WORKSPACE_CONFIG_FILE), document, "utf8");
    const failure = await loadWorkspaceConfig(root).catch((error: unknown): unknown => error);
    expect(failure).toBeInstanceOf(WorkspaceConfigError);
    expect((failure as WorkspaceConfigError).details?.["issues"]).toBeDefined();
  });
});

const BETA_DRAFT: RepositoryDraft = {
  name: "beta",
  url: "https://example.com/beta.git",
  path: "apps/beta",
  branch: "dev",
};

const EXISTING_REPOSITORIES: readonly WorkspaceRepository[] = [
  { name: "alpha", url: "https://example.com/alpha.git", path: "apps/alpha", branch: "main" },
  { name: "beta", url: "https://example.com/beta.git", path: "apps/beta", branch: "main" },
];

describe("planUpsert", (): void => {
  test("plans an addition for a new name", (): void => {
    expect(
      planUpsert(EXISTING_REPOSITORIES, { ...BETA_DRAFT, name: "gamma", path: "apps/gamma" }),
    ).toEqual({
      change: "added",
      index: -1,
    });
  });

  test("plans an update for an existing name", (): void => {
    expect(planUpsert(EXISTING_REPOSITORIES, { ...BETA_DRAFT, branch: "release" })).toEqual({
      change: "updated",
      index: 1,
    });
  });

  test("allows an update that keeps its own path", (): void => {
    expect(planUpsert(EXISTING_REPOSITORIES, BETA_DRAFT).change).toBe("updated");
  });

  test("rejects a path occupied by another repository", (): void => {
    const failure = ((): unknown => {
      try {
        return planUpsert(EXISTING_REPOSITORIES, {
          ...BETA_DRAFT,
          name: "gamma",
          path: "apps/alpha",
        });
      } catch (error) {
        return error;
      }
    })();
    expect(failure).toBeInstanceOf(WorkspaceConfigError);
    expect((failure as WorkspaceConfigError).message).toContain("alpha");
  });

  test("compares paths with normalized separators", (): void => {
    expect((): void => {
      planUpsert(EXISTING_REPOSITORIES, { ...BETA_DRAFT, name: "gamma", path: "apps\\alpha\\" });
    }).toThrow(WorkspaceConfigError);
  });

  test("compares paths after resolving dot segments", (): void => {
    expect((): void => {
      planUpsert(EXISTING_REPOSITORIES, {
        ...BETA_DRAFT,
        name: "gamma",
        path: "apps/./alpha",
      });
    }).toThrow(WorkspaceConfigError);
  });
});

describe("planRemove", (): void => {
  test("locates the index of an existing name", (): void => {
    expect(planRemove(EXISTING_REPOSITORIES, "beta")).toEqual({ index: 1 });
  });

  test("fails for an unknown name", (): void => {
    const failure = ((): unknown => {
      try {
        return planRemove(EXISTING_REPOSITORIES, "gamma");
      } catch (error) {
        return error;
      }
    })();
    expect(failure).toBeInstanceOf(WorkspaceConfigError);
    expect((failure as WorkspaceConfigError).message).toContain("gamma");
  });
});

const COMMENTED_CONFIG = `# workspace repositories
repositories:
  - name: alpha # primary repo
    url: https://example.com/alpha.git
    path: apps/alpha
    branch: main
`;

describe("prepareUpsertRepository", (): void => {
  test("appends an entry on commit and preserves comments", async (): Promise<void> => {
    const root = await createDirectory();
    const config = path.join(root, WORKSPACE_CONFIG_FILE);
    await writeFile(config, COMMENTED_CONFIG, "utf8");
    const prepared = await prepareUpsertRepository(root, BETA_DRAFT);
    expect(prepared.change).toBe("added");
    expect(prepared.root).toBe(root);
    expect(prepared.config).toBe(config);
    expect(prepared.repository).toEqual(BETA_DRAFT);
    expect(await readFile(config, "utf8")).toBe(COMMENTED_CONFIG);
    await prepared.commit();
    const document = await readFile(config, "utf8");
    expect(document).toContain("# workspace repositories");
    expect(document).toContain("# primary repo");
    const loaded = await loadWorkspaceConfig(root);
    expect(
      loaded.repositories.map((repository: WorkspaceRepository): string => repository.name),
    ).toEqual(["alpha", "beta"]);
  });

  test("updates url, path and branch in place for an existing name", async (): Promise<void> => {
    const root = await createDirectory();
    const config = path.join(root, WORKSPACE_CONFIG_FILE);
    await writeFile(config, COMMENTED_CONFIG, "utf8");
    const prepared = await prepareUpsertRepository(root, {
      name: "alpha",
      url: "git@example.com:alpha.git",
      path: "packages/alpha",
      branch: "dev",
    });
    expect(prepared.change).toBe("updated");
    await prepared.commit();
    const document = await readFile(config, "utf8");
    expect(document).toContain("# primary repo");
    const loaded = await loadWorkspaceConfig(root);
    expect(loaded.repositories).toEqual([
      { name: "alpha", url: "git@example.com:alpha.git", path: "packages/alpha", branch: "dev" },
    ]);
  });

  test("rejects a draft whose path is occupied by another repository without writing", async (): Promise<void> => {
    const root = await createDirectory();
    const config = path.join(root, WORKSPACE_CONFIG_FILE);
    await writeFile(config, COMMENTED_CONFIG, "utf8");
    const failure = await prepareUpsertRepository(root, {
      ...BETA_DRAFT,
      path: "apps/alpha",
    }).catch((error: unknown): unknown => error);
    expect(failure).toBeInstanceOf(WorkspaceConfigError);
    expect(await readFile(config, "utf8")).toBe(COMMENTED_CONFIG);
  });

  test("rejects an invalid draft without writing", async (): Promise<void> => {
    const root = await createDirectory();
    const config = path.join(root, WORKSPACE_CONFIG_FILE);
    await writeFile(config, COMMENTED_CONFIG, "utf8");
    const failure = await prepareUpsertRepository(root, {
      ...BETA_DRAFT,
      url: "ftp://example.com/beta.git",
    }).catch((error: unknown): unknown => error);
    expect(failure).toBeInstanceOf(WorkspaceConfigError);
    expect((failure as WorkspaceConfigError).details?.["issues"]).toBeDefined();
    expect(await readFile(config, "utf8")).toBe(COMMENTED_CONFIG);
  });
});

describe("prepareRemoveRepository", (): void => {
  test("removes the entry on commit and keeps other entries and comments", async (): Promise<void> => {
    const root = await createDirectory();
    const config = path.join(root, WORKSPACE_CONFIG_FILE);
    await writeFile(
      config,
      `${COMMENTED_CONFIG}  - name: beta
    url: https://example.com/beta.git
    path: apps/beta
    branch: dev
`,
      "utf8",
    );
    const prepared = await prepareRemoveRepository(root, "alpha");
    expect(prepared.removed).toMatchObject({ name: "alpha", path: "apps/alpha" });
    expect(await readFile(config, "utf8")).toContain("name: alpha");
    await prepared.commit();
    const document = await readFile(config, "utf8");
    expect(document).toContain("# workspace repositories");
    expect(document).not.toContain("alpha");
    const loaded = await loadWorkspaceConfig(root);
    expect(
      loaded.repositories.map((repository: WorkspaceRepository): string => repository.name),
    ).toEqual(["beta"]);
  });

  test("fails for an unknown name without writing", async (): Promise<void> => {
    const root = await createDirectory();
    const config = path.join(root, WORKSPACE_CONFIG_FILE);
    await writeFile(config, COMMENTED_CONFIG, "utf8");
    const failure = await prepareRemoveRepository(root, "gamma").catch(
      (error: unknown): unknown => error,
    );
    expect(failure).toBeInstanceOf(WorkspaceConfigError);
    expect((failure as WorkspaceConfigError).message).toContain("gamma");
    expect(await readFile(config, "utf8")).toBe(COMMENTED_CONFIG);
  });

  test("ignores a residual workspace.local.yaml entry", async (): Promise<void> => {
    const root = await createDirectory();
    await writeFile(path.join(root, WORKSPACE_CONFIG_FILE), COMMENTED_CONFIG, "utf8");
    await writeFile(
      path.join(root, WORKSPACE_LOCAL_FILE),
      `repositories:
  - name: alpha
    clone_path: C:/Users/kxh/workspaces/alpha
`,
      "utf8",
    );
    const prepared = await prepareRemoveRepository(root, "alpha");
    await prepared.commit();
    const local = await readFile(path.join(root, WORKSPACE_LOCAL_FILE), "utf8");
    expect(local).toContain("clone_path");
  });
});
