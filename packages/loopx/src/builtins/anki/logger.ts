import { channel } from "node:diagnostics_channel";
import type { AnkiConfig } from "./config";

export interface Logger {
  readonly debug: (message: string) => void;
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

const ranks: Record<AnkiConfig["logLevel"], number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
const diagnosticChannel = channel("loopx.anki");

export const createLogger = (level: AnkiConfig["logLevel"]): Logger => {
  const publish = (eventLevel: "debug" | "info" | "warn", message: string): void => {
    if (ranks[eventLevel] < ranks[level]) return;
    diagnosticChannel.publish({ level: eventLevel, message });
  };
  return {
    debug: (message: string): void => publish("debug", message),
    info: (message: string): void => publish("info", message),
    warn: (message: string): void => publish("warn", message),
  };
};
