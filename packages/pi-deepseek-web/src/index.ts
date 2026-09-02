import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createConfigLoader, type ConfigLoader } from "./plugin-config.js";

const piDeepSeekWeb = (_pi: ExtensionAPI): void => {};

export default piDeepSeekWeb;

export const createGlobalConfigLoader = (): ConfigLoader =>
  createConfigLoader({ agentDir: getAgentDir() });

export { createConfigLoader, getConfigPath } from "./plugin-config.js";
export type { FetchConfig, PluginConfig, SearchConfig } from "./plugin-config.js";
