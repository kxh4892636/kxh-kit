import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

import piNanoSubagent from "./index.js";

const ORIGINAL_AGENT_DIR = process.env["PI_CODING_AGENT_DIR"];
const createdDirectories: string[] = [];

afterEach(async (): Promise<void> => {
  if (ORIGINAL_AGENT_DIR === undefined) delete process.env["PI_CODING_AGENT_DIR"];
  else process.env["PI_CODING_AGENT_DIR"] = ORIGINAL_AGENT_DIR;
  await Promise.all(
    createdDirectories
      .splice(0)
      .map((path: string): Promise<void> => rm(path, { recursive: true })),
  );
});

describe("Pi extension entry", (): void => {
  it("loads the startup snapshot and registers the one Subagent tool", async (): Promise<void> => {
    const agentDir = await mkdtemp(join(tmpdir(), "pi-nano-subagent-"));
    createdDirectories.push(agentDir);
    await writeFile(join(agentDir, "pi-nano-subagent.json"), '{"maxConcurrency":3}');
    process.env["PI_CODING_AGENT_DIR"] = agentDir;
    const registerTool = vi.fn();
    const pi = { registerTool } as unknown as ExtensionAPI;

    await piNanoSubagent(pi);

    expect(registerTool).toHaveBeenCalledOnce();
    expect(registerTool.mock.calls[0]?.[0]).toMatchObject({
      name: "subagent",
      executionMode: "parallel",
    });
  });
});
