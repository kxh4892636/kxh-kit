import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
  InputEvent,
  InputEventResult,
  SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import piNestedSkill from "./index.ts";

type ResourcesDiscoverEvent = Extract<ExtensionEvent, { type: "resources_discover" }>;
type ResourcesDiscoverHandler = (
  event: ResourcesDiscoverEvent,
) => Promise<{ skillPaths: string[] }>;
type InputHandler = (event: InputEvent, context: ExtensionContext) => Promise<InputEventResult>;

interface ExtensionHarness {
  resourcesHandler: ResourcesDiscoverHandler;
  inputHandler: InputHandler;
}

const cleanupPaths: string[] = [];

const createHarness = (getCommands: () => SlashCommandInfo[]): ExtensionHarness => {
  let resourcesHandler: ResourcesDiscoverHandler | undefined;
  let inputHandler: InputHandler | undefined;
  const pi = {
    getCommands,
    on: (event: string, candidate: ResourcesDiscoverHandler | InputHandler): void => {
      if (event === "resources_discover") resourcesHandler = candidate as ResourcesDiscoverHandler;
      if (event === "input") inputHandler = candidate as InputHandler;
    },
  } as unknown as ExtensionAPI;
  piNestedSkill(pi);
  if (resourcesHandler === undefined || inputHandler === undefined)
    throw new Error("extension handlers not registered");
  return { resourcesHandler, inputHandler };
};

const skillCommand = (name: string, path: string): SlashCommandInfo => ({
  name: `skill:${name}`,
  source: "skill",
  sourceInfo: { path, source: "local", scope: "project", origin: "top-level" },
});

afterEach(async (): Promise<void> => {
  await Promise.all(
    cleanupPaths
      .splice(0)
      .map((path: string): Promise<void> => rm(path, { recursive: true, force: true })),
  );
});

describe("pi-nested-skill extension", (): void => {
  it("refreshes nested discovery and expands its catalog entry through the input hook", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "pi-nested-skill-"));
    cleanupPaths.push(root);
    const nativeSkillPath = join(root, "nano-flow", "SKILL.md");
    const nestedSkillPath = join(root, "nano-flow", "references", "skills", "to-story", "SKILL.md");
    const reloadedSkillPath = join(
      root,
      "nano-flow",
      "references",
      "skills",
      "to-issues",
      "SKILL.md",
    );
    await mkdir(dirname(nestedSkillPath), { recursive: true });
    await writeFile(
      nativeSkillPath,
      "---\nname: nano-flow\ndescription: flow\n---\n\nFlow body.\n",
      "utf8",
    );
    await writeFile(
      nestedSkillPath,
      "---\nname: to-story\ndescription: story\n---\n\nStory body.\n",
      "utf8",
    );
    const commands = [skillCommand("nano-flow", nativeSkillPath)];
    const harness = createHarness((): SlashCommandInfo[] => commands);

    const startupResult = await harness.resourcesHandler({
      type: "resources_discover",
      cwd: root,
      reason: "startup",
    });
    expect(startupResult.skillPaths).toEqual([nestedSkillPath]);
    expect(startupResult.skillPaths).not.toContain(nativeSkillPath);

    commands.push(skillCommand("to-story", nestedSkillPath));
    const images: NonNullable<InputEvent["images"]> = [
      { type: "image", data: "base64", mimeType: "image/png" },
    ];
    const context = { ui: { notify: (): void => undefined } } as unknown as ExtensionContext;
    for (const source of ["interactive", "rpc"] as const) {
      const result = await harness.inputHandler(
        {
          type: "input",
          text: "Plan with /skill:to-story now.",
          source,
          images,
          streamingBehavior: source === "interactive" ? "steer" : "followUp",
        },
        context,
      );
      expect(result).toEqual({
        action: "transform",
        images,
        text: `Plan with <skill name="to-story" location="${nestedSkillPath}">\nReferences are relative to ${dirname(nestedSkillPath)}.\n\nStory body.\n</skill> now.`,
      });
    }
    const resultWithoutImages = await harness.inputHandler(
      { type: "input", text: "/skill:to-story", source: "interactive" },
      context,
    );
    expect(resultWithoutImages).toEqual({
      action: "transform",
      text: `<skill name="to-story" location="${nestedSkillPath}">\nReferences are relative to ${dirname(nestedSkillPath)}.\n\nStory body.\n</skill>`,
    });

    await mkdir(dirname(reloadedSkillPath), { recursive: true });
    await writeFile(reloadedSkillPath, "---\nname: to-issues\ndescription: issues\n---\n", "utf8");
    const reloadResult = await harness.resourcesHandler({
      type: "resources_discover",
      cwd: root,
      reason: "reload",
    });
    expect(reloadResult.skillPaths).toEqual([reloadedSkillPath]);
  });

  it("expands multiple loaded skill markers through one input hook event", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "pi-nested-multi-skill-"));
    cleanupPaths.push(root);
    const storySkillPath = join(root, "nano-flow", "references", "skills", "to-story", "SKILL.md");
    const domainSkillPath = join(
      root,
      "nano-flow",
      "references",
      "skills",
      "quest-with-domain",
      "SKILL.md",
    );
    await mkdir(dirname(storySkillPath), { recursive: true });
    await mkdir(dirname(domainSkillPath), { recursive: true });
    await writeFile(
      storySkillPath,
      "---\nname: to-story\ndescription: story\n---\n\nStory body.\n",
      "utf8",
    );
    await writeFile(
      domainSkillPath,
      "---\nname: quest-with-domain\ndescription: domain\n---\n\nDomain body.\n",
      "utf8",
    );
    const harness = createHarness((): SlashCommandInfo[] => [
      skillCommand("to-story", storySkillPath),
      skillCommand("quest-with-domain", domainSkillPath),
    ]);
    const context = { ui: { notify: (): void => undefined } } as unknown as ExtensionContext;

    const result = await harness.inputHandler(
      {
        type: "input",
        text: "请 /skill:to-story 梳理故事，然后 /skill:quest-with-domain 拷问领域设计",
        source: "interactive",
        streamingBehavior: "steer",
      },
      context,
    );

    expect(result).toEqual({
      action: "transform",
      text: `请 <skill name="to-story" location="${storySkillPath}">\nReferences are relative to ${dirname(storySkillPath)}.\n\nStory body.\n</skill> 梳理故事，然后 <skill name="quest-with-domain" location="${domainSkillPath}">\nReferences are relative to ${dirname(domainSkillPath)}.\n\nDomain body.\n</skill> 拷问领域设计`,
    });
  });

  it("skips extension input and reports only the failed skill name and path", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "pi-nested-input-"));
    cleanupPaths.push(root);
    const missingPath = join(root, "missing", "SKILL.md");
    const harness = createHarness((): SlashCommandInfo[] => [skillCommand("missing", missingPath)]);
    const images: NonNullable<InputEvent["images"]> = [
      { type: "image", data: "base64", mimeType: "image/png" },
    ];
    const notifications: Array<{ message: string; type: string | undefined }> = [];
    const context = {
      ui: {
        notify: (message: string, type?: "info" | "warning" | "error"): void => {
          notifications.push({ message, type });
        },
      },
    } as unknown as ExtensionContext;

    await expect(
      harness.inputHandler({ type: "input", text: "/skill:missing", source: "extension" }, context),
    ).resolves.toEqual({ action: "continue" });
    await expect(
      harness.inputHandler(
        {
          type: "input",
          text: "/skill:missing task",
          source: "rpc",
          images,
          streamingBehavior: "followUp",
        },
        context,
      ),
    ).resolves.toEqual({ action: "continue" });
    await expect(
      harness.inputHandler(
        { type: "input", text: "/skill:missing", source: "interactive" },
        context,
      ),
    ).resolves.toEqual({ action: "continue" });
    expect(notifications).toEqual([
      { message: `Unable to read skill missing at ${missingPath}`, type: "warning" },
      { message: `Unable to read skill missing at ${missingPath}`, type: "warning" },
    ]);
  });
});
