import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createConfigLoader, type ConfigLoader } from "./plugin-config.js";
import type { PluginConfig } from "./plugin-config.js";
import { registerSearchTool } from "./search/search-tool.js";

const piDeepSeekWeb = (pi: ExtensionAPI): void => {
  registerSearchTool(pi, {
    loadConfig: async (): Promise<PluginConfig> => createGlobalConfigLoader().load(),
  });
};

export default piDeepSeekWeb;

export const createGlobalConfigLoader = (): ConfigLoader =>
  createConfigLoader({ agentDir: getAgentDir() });

export { createConfigLoader, getConfigPath } from "./plugin-config.js";
export type { FetchConfig, PluginConfig, SearchConfig } from "./plugin-config.js";
