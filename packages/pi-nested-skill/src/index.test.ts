import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it } from "vitest";
import piNestedSkill, { type NestedSkillOptions } from "./index.ts";

type Handler = (...args: unknown[]) => unknown;

const created: string[] = [];

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pi-ns-index-"));
  created.push(dir);
  return dir;
};

const writeSkill = (dir: string, name: string): string => {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "SKILL.md");
  writeFileSync(file, `---\nname: ${name}\ndescription: ${name} skill\n---\n\n# ${name}\n\nbody\n`);
  return file;
};

const buildProject = (): { project: string; alphaFile: string } => {
  const project = tempDir();
  mkdirSync(join(project, ".git"), { recursive: true });
  const alphaFile = writeSkill(join(project, ".agents/skills/alpha"), "alpha");
  writeSkill(join(project, ".agents/skills/alpha/references/skills/beta"), "beta");
  return { project, alphaFile };
};

const skillCommand = (name: string, path: string): SlashCommandInfo => ({
  name: `skill:${name}`,
  source: "skill",
  sourceInfo: { path, source: "local", scope: "user", origin: "top-level" },
});

const emptyOptions = (): NestedSkillOptions => ({ agentDir: tempDir(), homeDir: tempDir() });

const setup = (commands: SlashCommandInfo[], options: NestedSkillOptions): Map<string, Handler> => {
  const handlers = new Map<string, Handler>();
  const fake = {
    on: (event: string, handler: Handler) => {
      handlers.set(event, handler);
    },
    getCommands: () => commands,
  } as unknown as ExtensionAPI;
  piNestedSkill(fake, options);
  return handlers;
};

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("piNestedSkill", () => {
  it("returns hidden nested skill paths from resources_discover", async () => {
    const { project } = buildProject();
    const handlers = setup([], emptyOptions());
    const result = (await handlers.get("resources_discover")?.(
      {},
      { cwd: project, isProjectTrusted: () => true },
    )) as { skillPaths: string[] };
    expect(
      result.skillPaths.some((path) =>
        path.replaceAll("\\", "/").endsWith("references/skills/beta"),
      ),
    ).toBe(true);
  });

  it("registers the $ autocomplete provider when the UI is present", () => {
    const handlers = setup([], emptyOptions());
    let factory: ((current: AutocompleteProvider) => AutocompleteProvider) | undefined;
    handlers.get("session_start")?.(
      {},
      {
        hasUI: true,
        ui: {
          addAutocompleteProvider: (candidate: typeof factory) => {
            factory = candidate;
          },
        },
      },
    );
    expect(factory).toBeTypeOf("function");
  });

  it("skips autocomplete registration without a UI", () => {
    const handlers = setup([], emptyOptions());
    let called = false;
    handlers.get("session_start")?.(
      {},
      {
        hasUI: false,
        ui: {
          addAutocompleteProvider: () => {
            called = true;
          },
        },
      },
    );
    expect(called).toBe(false);
  });

  it("expands known $ references before submission", () => {
    const { alphaFile } = buildProject();
    const handlers = setup([skillCommand("alpha", alphaFile)], emptyOptions());
    const result = handlers.get("input")?.({ text: "run $alpha now", source: "interactive" }) as {
      action: string;
      text?: string;
    };
    expect(result.action).toBe("transform");
    expect(result.text).toContain('<skill name="alpha"');
    expect(result.text).toContain("run ");
  });

  it("continues when nothing resolves and skips extension-sourced input", () => {
    const { alphaFile } = buildProject();
    const handlers = setup([skillCommand("alpha", alphaFile)], emptyOptions());
    expect(handlers.get("input")?.({ text: "run $missing", source: "interactive" })).toEqual({
      action: "continue",
    });
    expect(handlers.get("input")?.({ text: "run $alpha", source: "extension" })).toEqual({
      action: "continue",
    });
  });
});
