import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createConfigLoader } from "./config.js";
import { createSubagentTool } from "./tool.js";

const piNanoSubagent = async (pi: ExtensionAPI): Promise<void> => {
  try {
    const config = await createConfigLoader({ agentDir: getAgentDir() }).load();
    pi.registerTool(createSubagentTool({ maxConcurrency: config.maxConcurrency }));
  } catch (cause: unknown) {
    throw new Error("pi-nano-subagent extension initialization failed", { cause });
  }
};

export default piNanoSubagent;

export { createConfigLoader, getConfigPath } from "./config.js";
export type { ConfigLoader, SubagentConfig } from "./config.js";
export { MAX_DELEGATION_DEPTH, createSubagentTool } from "./tool.js";
export type { SubagentDetails, SubagentToolOptions } from "./tool.js";
