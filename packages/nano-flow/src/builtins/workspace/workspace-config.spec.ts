import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  loadWorkspaceFile,
  planRemove,
  prepareRemoveRepository,
  WORKSPACE_CONFIG_FILE,
  WorkspaceConfigError,
  type WorkspaceRepository,
} from "./workspace-config";

const temporaryDirectories: string[] = [];

const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "nf-workspace-config-"));
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

describe("loadWorkspaceFile", (): void => {
  test("locates the workspace root from a nested subdirectory", async (): Promise<void> => {
    const root = await createDirectory();
    const nested = path.join(root, "apps", "kxh-kit", "src");
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, WORKSPACE_CONFIG_FILE), VALID_CONFIG, "utf8");
    const config = await loadWorkspaceFile(nested);
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
    const failure = await loadWorkspaceFile(directory).catch((error: unknown): unknown => error);
    expect(failure).toBeInstanceOf(WorkspaceConfigError);
    expect((failure as WorkspaceConfigError).message).toBe(
      `No ${WORKSPACE_CONFIG_FILE} found from ${directory} upwards`,
    );
    expect((failure as WorkspaceConfigError).hint).toBe(
      `Run 'nf workspace config init' to create ${WORKSPACE_CONFIG_FILE} first`,
    );
    expect((failure as WorkspaceConfigError).details).toBeUndefined();
  });

  test("accepts an empty repositories list", async (): Promise<void> => {
    const root = await createDirectory();
    await writeFile(path.join(root, WORKSPACE_CONFIG_FILE), "repositories: []\n", "utf8");
    const config = await loadWorkspaceFile(root);
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
    const config = await loadWorkspaceFile(root);
    expect(config.repositories[0]?.name).toBe("wiki");
  });
});

describe("loadWorkspaceFile", (): void => {
  test.each([
    {
      title: "duplicate name",
      issue: "repositories.1.name: duplicate repository name: kxh-kit",
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
      issue: "repositories.1.path: duplicate repository path: apps/kxh-kit",
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
      issue: "repositories.1.path: duplicate repository path: apps\\kxh-kit",
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
      issue:
        "repositories.0.url: url must be an ssh (git@host:path or ssh://), http(s) or file url",
      document: `repositories:
  - name: kxh-kit
    url: ftp://github.com/kxh4892636/kxh-kit.git
    path: apps/kxh-kit
    branch: main
`,
    },
    {
      title: "absolute path",
      issue:
        "repositories.0.path: path must be relative to the workspace root and must not contain '..'",
      document: `repositories:
  - name: kxh-kit
    url: git@github.com:kxh4892636/kxh-kit.git
    path: /abs/kxh-kit
    branch: main
`,
    },
    {
      title: "path escaping the workspace root",
      issue:
        "repositories.0.path: path must be relative to the workspace root and must not contain '..'",
      document: `repositories:
  - name: kxh-kit
    url: git@github.com:kxh4892636/kxh-kit.git
    path: apps/../kxh-kit
    branch: main
`,
    },
    {
      title: "drive-relative path",
      issue:
        "repositories.0.path: path must be relative to the workspace root and must not contain '..'",
      document: `repositories:
  - name: kxh-kit
    url: git@github.com:kxh4892636/kxh-kit.git
    path: C:outside
    branch: main
`,
    },
  ])(
    "rejects a config with $title",
    async ({ document, issue }: { document: string; issue: string }): Promise<void> => {
      const root = await createDirectory();
      const config = path.join(root, WORKSPACE_CONFIG_FILE);
      await writeFile(config, document, "utf8");
      const failure = await loadWorkspaceFile(root).catch((error: unknown): unknown => error);
      expect(failure).toBeInstanceOf(WorkspaceConfigError);
      expect((failure as WorkspaceConfigError).message).toBe(`Invalid ${config}`);
      expect((failure as WorkspaceConfigError).details).toEqual({ issues: [issue] });
      expect((failure as WorkspaceConfigError).hint).toBeUndefined();
    },
  );
});

const EXISTING_REPOSITORIES: readonly WorkspaceRepository[] = [
  { name: "alpha", url: "https://example.com/alpha.git", path: "apps/alpha", branch: "main" },
  { name: "beta", url: "https://example.com/beta.git", path: "apps/beta", branch: "main" },
];

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
    expect((failure as WorkspaceConfigError).message).toBe(
      "Repository not found in workspace.yaml: gamma",
    );
    expect((failure as WorkspaceConfigError).details).toEqual({ name: "gamma" });
  });
});

const COMMENTED_CONFIG = `# workspace repositories
repositories:
  - name: alpha # primary repo
    url: https://example.com/alpha.git
    path: apps/alpha
    branch: main
`;

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
    expect(prepared.removed).toEqual({
      name: "alpha",
      url: "https://example.com/alpha.git",
      path: "apps/alpha",
      branch: "main",
    });
    expect(await readFile(config, "utf8")).toContain("name: alpha");
    await prepared.commit();
    const document = await readFile(config, "utf8");
    expect(document).toContain("# workspace repositories");
    expect(document).not.toContain("alpha");
    const loaded = await loadWorkspaceFile(root);
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
    expect((failure as WorkspaceConfigError).message).toBe(
      "Repository not found in workspace.yaml: gamma",
    );
    expect((failure as WorkspaceConfigError).details).toEqual({ name: "gamma" });
    expect(await readFile(config, "utf8")).toBe(COMMENTED_CONFIG);
  });
});
