import { librarySchema, type Library } from "../../../shared/tracks.ts";

export class LibraryRequestError extends Error {}

/**
 * The index comes from our own server, but it is still a network boundary:
 * check the envelope and every record before anything renders.
 */
export const fetchLibrary = async (signal?: AbortSignal): Promise<Library> => {
  const response = await fetch("/api/tracks", {
    signal: signal ?? null,
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new LibraryRequestError(`曲目索引请求失败：${response.status}`);
  }
  const payload: unknown = await response.json();
  const envelope = payload as { ok?: unknown; data?: unknown };
  if (envelope.ok !== true) {
    throw new LibraryRequestError("曲目索引返回了错误");
  }
  const parsed = librarySchema.safeParse(envelope.data);
  if (!parsed.success) {
    throw new LibraryRequestError("曲目索引格式不对");
  }
  return parsed.data;
};
