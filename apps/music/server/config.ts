import { readFileSync } from "node:fs";
import { z } from "zod";

const settings = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  MUSIC_ROOT: z.string().trim().min(1),
  MUSIC_ROOT_CLASSICAL: z.string().trim().min(1),
  TRACKS_FILE: z.string().trim().min(1),
  WAVES_ROOT: z.string().trim().min(1),
  CLIENT_DIR: z.string().trim().min(1),
  BASE_PATH: z.string().trim().optional(),
});

export interface Config {
  port: number;
  musicRoot: string;
  classicalRoot: string;
  tracksFile: string;
  wavesRoot: string;
  clientDir: string;
  basePath: string;
}

const KEYS = [
  "PORT",
  "MUSIC_ROOT",
  "MUSIC_ROOT_CLASSICAL",
  "TRACKS_FILE",
  "WAVES_ROOT",
  "CLIENT_DIR",
  "BASE_PATH",
] as const;

type Key = (typeof KEYS)[number];

const readEnvFile = (file: string): Partial<Record<Key, string>> => {
  let contents = "";
  try {
    contents = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const values: Partial<Record<Key, string>> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim() as Key;
    const value = trimmed.slice(index + 1).trim();
    if (!KEYS.includes(key) || !value) continue;
    if (values[key] === undefined) values[key] = value;
  }
  return values;
};

export const loadConfig = (file: string, environment: NodeJS.ProcessEnv = process.env): Config => {
  const fromFile = readEnvFile(file);
  const pick = (key: Key, fallback: string): string =>
    environment[key]?.trim() || fromFile[key] || fallback;

  const musicRoot = pick("MUSIC_ROOT", "C:\\Users\\kxh\\Music\\musopen-flac");
  const parsed = settings.parse({
    PORT: pick("PORT", "5210"),
    MUSIC_ROOT: musicRoot,
    // Older deployments only know MUSIC_ROOT; falling back keeps them booting,
    // and classical tracks simply 404 until the second collection is uploaded.
    MUSIC_ROOT_CLASSICAL: pick("MUSIC_ROOT_CLASSICAL", musicRoot),
    TRACKS_FILE: pick("TRACKS_FILE", "./server/data/tracks.json"),
    WAVES_ROOT: pick("WAVES_ROOT", "./server/data/waves"),
    CLIENT_DIR: pick("CLIENT_DIR", "./dist/client"),
    BASE_PATH: pick("BASE_PATH", ""),
  });

  return {
    port: parsed.PORT,
    musicRoot: parsed.MUSIC_ROOT,
    classicalRoot: parsed.MUSIC_ROOT_CLASSICAL,
    tracksFile: parsed.TRACKS_FILE,
    wavesRoot: parsed.WAVES_ROOT,
    clientDir: parsed.CLIENT_DIR,
    basePath: parsed.BASE_PATH ?? "",
  };
};
