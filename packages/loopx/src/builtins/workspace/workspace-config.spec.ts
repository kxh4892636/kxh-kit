import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  loadWorkspaceConfig,
  WORKSPACE_CONFIG_FILE,
  WORKSPACE_LOCAL_FILE,
  WorkspaceConfigError,
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
  ])("rejects a config with $title", async ({ document }: { document: string }): Promise<void> => {
    const root = await createDirectory();
    await writeFile(path.join(root, WORKSPACE_CONFIG_FILE), document, "utf8");
    const failure = await loadWorkspaceConfig(root).catch((error: unknown): unknown => error);
    expect(failure).toBeInstanceOf(WorkspaceConfigError);
    expect((failure as WorkspaceConfigError).details?.["issues"]).toBeDefined();
  });
});
