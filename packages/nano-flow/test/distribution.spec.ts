import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, "..");
const packageName = "@kxh4892636/nano-flow";

interface ProcessResult {
  readonly stderr: string;
  readonly stdout: string;
}

interface FakeAnkiServer {
  readonly actions: string[];
  readonly close: () => Promise<void>;
  readonly url: string;
}

interface DistributionFixture {
  readonly bin: string;
  readonly installedPackage: string;
  readonly sandbox: string;
  readonly workspace: string;
}

const executeNpm = async (arguments_: readonly string[], cwd: string): Promise<ProcessResult> => {
  const command =
    process.platform === "win32"
      ? [
          process.execPath,
          path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
        ]
      : ["npm"];
  const executable = command[0];
  if (executable === undefined) throw new Error("Unable to resolve npm executable");
  const { stderr, stdout } = await execFileAsync(executable, [...command.slice(1), ...arguments_], {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  return { stderr, stdout };
};

const executeBin = async (
  executable: string,
  arguments_: readonly string[],
  cwd: string,
): Promise<ProcessResult> => {
  const command =
    process.platform === "win32"
      ? [process.env["ComSpec"] ?? "cmd.exe", "/d", "/s", "/c", executable]
      : [executable];
  const program = command[0];
  if (program === undefined) throw new Error("Unable to resolve installed Nano Flow bin");
  const { stderr, stdout } = await execFileAsync(program, [...command.slice(1), ...arguments_], {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  return { stderr, stdout };
};

const parseObject = (stdout: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(stdout);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Installed Nano Flow returned non-object JSON");
  }
  return value as Record<string, unknown>;
};

const collectTree = async (root: string, relative = ""): Promise<readonly string[]> => {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const collected: string[] = [];
  for (const entry of entries.sort((left: Dirent, right: Dirent): number =>
    left.name.localeCompare(right.name),
  )) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) collected.push(...(await collectTree(root, child)));
    else {
      const hash = createHash("sha256")
        .update(await readFile(path.join(root, child)))
        .digest("hex");
      collected.push(`${child}:${hash}`);
    }
  }
  return collected;
};

const readBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve: (body: string) => void, reject: (reason?: unknown) => void): void => {
    let body = "";
    request.on("data", (chunk: Buffer): void => {
      body += chunk.toString("utf8");
    });
    request.on("end", (): void => resolve(body));
    request.on("error", reject);
  });

const actionFromBody = (body: string): string => {
  const value: unknown = JSON.parse(body);
  if (
    typeof value !== "object" ||
    value === null ||
    !("action" in value) ||
    typeof value.action !== "string"
  ) {
    throw new Error("Fake AnkiConnect received an invalid request");
  }
  return value.action;
};

const startFakeAnki = (): Promise<FakeAnkiServer> =>
  new Promise(
    (resolve: (server: FakeAnkiServer) => void, reject: (reason?: unknown) => void): void => {
      const actions: string[] = [];
      const server: Server = createServer(
        (request: IncomingMessage, response: ServerResponse): void => {
          void readBody(request)
            .then((body: string): void => {
              const action = actionFromBody(body);
              actions.push(action);
              const result: unknown = action === "deckNames" ? ["Default"] : 42;
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify({ result, error: null }));
            })
            .catch((error: unknown): void => {
              response.statusCode = 400;
              response.end(JSON.stringify({ result: null, error: String(error) }));
            });
        },
      );
      server.on("error", reject);
      server.listen(0, "127.0.0.1", (): void => {
        const address = server.address();
        if (address === null || typeof address === "string") {
          server.close();
          reject(new Error("Fake AnkiConnect did not bind to a TCP port"));
          return;
        }
        resolve({
          actions,
          url: `http://127.0.0.1:${address.port}`,
          close: async (): Promise<void> =>
            new Promise((done: () => void, fail: (reason?: unknown) => void): void => {
              server.close((error?: Error): void => {
                if (error === undefined) done();
                else fail(error);
              });
            }),
        });
      });
    },
  );

const helpPaths = [
  [],
  ["self"],
  ["self", "skill"],
  ...["list", "check", "install", "update", "uninstall"].map((leaf: string): string[] => [
    "self",
    "skill",
    leaf,
  ]),
  ["self", "update"],
  ["workspace"],
  ["workspace", "config"],
  ...["init", "add", "list", "update", "remove"].map((leaf: string): string[] => [
    "workspace",
    "config",
    leaf,
  ]),
  ["workspace", "repository"],
  ...["clone", "status", "pull", "remove"].map((leaf: string): string[] => [
    "workspace",
    "repository",
    leaf,
  ]),
  ["workspace", "worktree"],
  ...["add", "list", "switch", "remove", "prune"].map((leaf: string): string[] => [
    "workspace",
    "worktree",
    leaf,
  ]),
  ["anki"],
  ...Object.entries({
    decks: ["list", "stats", "create", "move"],
    notes: ["add", "add-batch", "find", "info", "update", "delete"],
    models: [
      "list",
      "fields",
      "styling",
      "templates",
      "create",
      "update-styling",
      "update-templates",
      "field-add",
      "field-remove",
      "field-rename",
      "field-reposition",
    ],
    cards: ["due", "list", "present", "rate"],
    tags: ["list", "add", "remove", "replace", "clear-unused"],
    media: ["list", "get", "store", "delete"],
    stats: ["collection", "review"],
    gui: [
      "browse",
      "select",
      "selected-notes",
      "add-cards",
      "edit",
      "deck-overview",
      "deck-browser",
      "current-card",
      "show-question",
      "show-answer",
      "undo",
    ],
  }).flatMap(([group, leaves]: [string, string[]]): string[][] => [
    ["anki", group],
    ...leaves.map((leaf: string): string[] => ["anki", group, leaf]),
  ]),
  ["anki", "sync"],
  ["anki", "review"],
] as const;

const createDistributionFixture = async (): Promise<DistributionFixture> => {
  const sandbox = await mkdtemp(path.join(tmpdir(), "nf-distribution-"));
  try {
    const artifacts = path.join(sandbox, "artifacts");
    const prefix = path.join(sandbox, "prefix");
    const workspace = path.join(sandbox, "workspace");
    await Promise.all([
      mkdir(artifacts, { recursive: true }),
      mkdir(prefix, { recursive: true }),
      mkdir(workspace, { recursive: true }),
    ]);
    const packedOutput = await executeNpm(
      ["pack", "--ignore-scripts", "--json", "--pack-destination", artifacts],
      packageRoot,
    );
    const packedValue: unknown = JSON.parse(packedOutput.stdout);
    if (!Array.isArray(packedValue) || packedValue.length !== 1) {
      throw new Error("npm pack returned an invalid manifest");
    }
    const packed = packedValue[0];
    if (
      typeof packed !== "object" ||
      packed === null ||
      !("filename" in packed) ||
      typeof packed.filename !== "string"
    ) {
      throw new Error("npm pack did not return a filename");
    }
    await executeNpm(
      [
        "install",
        "--global",
        "--prefix",
        prefix,
        path.join(artifacts, packed.filename),
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
      ],
      workspace,
    );
    return {
      bin:
        process.platform === "win32"
          ? path.join(prefix, "nnf.cmd")
          : path.join(prefix, "bin", "nnf"),
      installedPackage: path.join(prefix, "node_modules", ...packageName.split("/")),
      sandbox,
      workspace,
    };
  } catch (error: unknown) {
    await rm(sandbox, { force: true, recursive: true });
    throw error;
  }
};

const invokeJson = async (
  fixture: DistributionFixture,
  arguments_: readonly string[],
): Promise<Record<string, unknown>> =>
  parseObject((await executeBin(fixture.bin, arguments_, fixture.workspace)).stdout);

const verifyDistributionSurface = async (fixture: DistributionFixture): Promise<void> => {
  await access(fixture.bin);
  const metadata = parseObject(
    await readFile(path.join(fixture.installedPackage, "package.json"), "utf8"),
  );
  expect(metadata["version"]).toBe("0.0.2");
  expect(metadata["bin"]).toEqual({ nnf: "dist/main.mjs" });
  const assets = [
    "README.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "skills/nano-flow/SKILL.md",
    "skills/nano-flow-cli/SKILL.md",
  ];
  await Promise.all(
    assets.map(
      (file: string): Promise<void> =>
        access(path.join(fixture.installedPackage, ...file.split("/"))),
    ),
  );
  const skillTree = await collectTree(path.join(fixture.installedPackage, "skills"));
  expect(skillTree.every((file: string): boolean => !file.includes(".test.mjs:"))).toBe(true);
  expect(
    skillTree.every(
      (file: string): boolean => !file.replaceAll("\\", "/").includes("/scripts/testing/"),
    ),
  ).toBe(true);
  for (const commandPath of helpPaths) {
    const result = await executeBin(fixture.bin, [...commandPath, "--help"], fixture.workspace);
    expect(result.stdout, commandPath.join(" ")).toContain("Usage:");
    expect(result.stderr, commandPath.join(" ")).toBe("");
  }
};

const verifySkillLifecycle = async (fixture: DistributionFixture): Promise<void> => {
  const target = path.join(fixture.workspace, "custom-skills");
  const invoke = async (arguments_: readonly string[]): Promise<Record<string, unknown>> =>
    invokeJson(fixture, ["self", "skill", ...arguments_, "--target", target, "--compact"]);
  expect(await invoke(["list"])).toMatchObject({
    skills: [
      { name: "nano-flow", status: "not_installed" },
      { name: "nano-flow-cli", status: "not_installed" },
    ],
  });
  await invoke(["install", "--all"]);
  for (const name of ["nano-flow", "nano-flow-cli"]) {
    expect(await invoke(["check", "--name", name])).toMatchObject({ name, status: "current" });
  }
  const before = await collectTree(target);
  expect(before.every((file: string): boolean => !file.includes(".test.mjs:"))).toBe(true);
  expect(
    before.every(
      (file: string): boolean => !file.replaceAll("\\", "/").includes("/scripts/testing/"),
    ),
  ).toBe(true);
  expect(await invoke(["update", "--name", "nano-flow", "--dry-run"])).toMatchObject({
    dryRun: true,
    preview: { changes: [{ action: "update", name: "nano-flow" }] },
  });
  expect(await invoke(["uninstall", "--all", "--dry-run"])).toMatchObject({
    dryRun: true,
    preview: { changes: [{ action: "uninstall" }, { action: "uninstall" }] },
  });
  expect(await collectTree(target)).toEqual(before);
  await invoke(["uninstall", "--all"]);
  expect(await invoke(["list"])).toMatchObject({
    skills: [
      { name: "nano-flow", status: "not_installed" },
      { name: "nano-flow-cli", status: "not_installed" },
    ],
  });
};

const verifyAnkiOperations = async (fixture: DistributionFixture): Promise<void> => {
  const server = await startFakeAnki();
  try {
    const query = await invokeJson(fixture, [
      "anki",
      "--anki-connect",
      server.url,
      "decks",
      "list",
      "--compact",
    ]);
    expect(query).toMatchObject({ success: true, total: 1 });
    expect(server.actions).toEqual(["deckNames"]);
    const preview = await invokeJson(fixture, [
      "anki",
      "--anki-connect",
      server.url,
      "decks",
      "create",
      "--name",
      "Distribution::Nested::Leaf",
      "--dry-run",
      "--compact",
    ]);
    expect(preview).toMatchObject({
      dryRun: true,
      preview: {
        actions: [{ action: "createDeck", params: { deck: "Distribution::Nested::Leaf" } }],
      },
    });
    expect(server.actions).toEqual(["deckNames"]);
    const mutation = await invokeJson(fixture, [
      "anki",
      "--anki-connect",
      server.url,
      "decks",
      "create",
      "--name",
      "Distribution::Nested::Leaf",
      "--compact",
    ]);
    expect(mutation).toMatchObject({
      success: true,
      created: true,
      deckId: 42,
      deckName: "Distribution::Nested::Leaf",
      parentDeck: "Distribution::Nested",
      childDeck: "Leaf",
      parentExisted: false,
    });
    expect(server.actions).toEqual(["deckNames", "deckNames", "createDeck"]);
  } finally {
    await server.close();
  }
};

describe("installed Nano Flow distribution", (): void => {
  let fixture: DistributionFixture | undefined;

  beforeAll(async (): Promise<void> => {
    fixture = await createDistributionFixture();
  }, 120_000);

  afterAll(async (): Promise<void> => {
    if (fixture !== undefined) await rm(fixture.sandbox, { force: true, recursive: true });
  });

  const getFixture = (): DistributionFixture => {
    if (fixture === undefined) throw new Error("Distribution fixture is not initialized");
    return fixture;
  };

  test("installs one bin, package assets, and every help path", async (): Promise<void> => {
    await verifyDistributionSurface(getFixture());
  }, 120_000);

  test("manages both packaged skills from the installed bin", async (): Promise<void> => {
    await verifySkillLifecycle(getFixture());
  }, 120_000);

  test("runs Anki query, mutation preview, and real mutation against a fake server", async (): Promise<void> => {
    await verifyAnkiOperations(getFixture());
  }, 120_000);
});
