import {
  parseSnapshot,
  type Identity,
  type ProcessSnapshot,
  type ProcessSource,
} from "./processes.js";
import { listeningPids, terminateWithSignals } from "./posix.js";
import { confirmIdentities, list, readProcesses, readText, type ProcReader } from "./proc.js";
export const defaultReader: ProcReader = { readText, list, listeningPids };
export const snapshot = async (
  port: number,
  reader: ProcReader = defaultReader,
  procRoot: string = "/proc",
): Promise<ProcessSnapshot> => {
  const rows = await readProcesses(reader, procRoot);
  return parseSnapshot({
    processes: rows.map((row: { identity: Identity }): Identity => row.identity),
    owners: await reader.listeningPids(port),
  });
};
// 终止：身份确认由 /proc 提供；默认入口与注入 reader 的入口共用同一装配。
const terminateWith =
  (reader: ProcReader) =>
  (identities: Identity[]): Promise<void> =>
    terminateWithSignals(
      identities,
      (candidates: Identity[]): Promise<Identity[]> => confirmIdentities(candidates, reader),
    );
export const terminate = terminateWith(defaultReader);
export const linuxPlatform = (reader: ProcReader = defaultReader): ProcessSource => ({
  snapshot: (port: number): Promise<ProcessSnapshot> => snapshot(port, reader),
  terminate: terminateWith(reader),
});
