import { readFileSync } from "node:fs";
import { z } from "zod";

const settings = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  MUSIC_ROOT: z.string().trim().min(1),
  TRACKS_FILE: z.string().trim().min(1),
  WAVES_ROOT: z.string().trim().min(1),
  CLIENT_DIR: z.string().trim().min(1),
});

export interface Config {
  port: number;
  musicRoot: string;
  tracksFile: string;
  wavesRoot: string;
  clientDir: string;
}

const KEYS = ["PORT", "MUSIC_ROOT", "TRACKS_FILE", "WAVES_ROOT", "CLIENT_DIR"] as const;

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

  const parsed = settings.parse({
    PORT: pick("PORT", "5210"),
    MUSIC_ROOT: pick("MUSIC_ROOT", "C:\\Users\\kxh\\Music\\musopen-flac"),
    TRACKS_FILE: pick("TRACKS_FILE", "./server/data/tracks.json"),
    WAVES_ROOT: pick("WAVES_ROOT", "./server/data/waves"),
    CLIENT_DIR: pick("CLIENT_DIR", "./dist/client"),
  });

  return {
    port: parsed.PORT,
    musicRoot: parsed.MUSIC_ROOT,
    tracksFile: parsed.TRACKS_FILE,
    wavesRoot: parsed.WAVES_ROOT,
    clientDir: parsed.CLIENT_DIR,
  };
};
