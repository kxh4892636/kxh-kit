import { cleanupBackendRuntime, killBackend, readBackendState } from "./backend";
const globalTeardown = async (): Promise<void> => {
  const state = readBackendState();
  if (state?.pid !== undefined) await killBackend(state.pid);
  cleanupBackendRuntime();
};
export default globalTeardown;
