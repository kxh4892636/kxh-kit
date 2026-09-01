import { CliUsageError } from "../../cli/errors";
import type { InvocationContext, OptionValues } from "../../cli/types";

export interface AnkiConfig {
  readonly apiKey: string | undefined;
  readonly apiVersion: number;
  readonly logLevel: "debug" | "error" | "info" | "warn";
  readonly readOnly: boolean;
  readonly timeout: number;
  readonly url: string;
}

const optionString = (options: OptionValues, name: string): string | undefined => {
  const value = options[name];
  return typeof value === "string" ? value : undefined;
};

const positiveInteger = (value: string | undefined, fallback: number, name: string): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new CliUsageError(`${name} must be positive`);
  return parsed;
};

const logLevel = (value: string | undefined): AnkiConfig["logLevel"] => {
  if (value === undefined) return "info";
  if (value === "debug" || value === "info" || value === "warn" || value === "error") return value;
  throw new CliUsageError("LOG_LEVEL must be debug, info, warn, or error");
};

export const loadAnkiConfig = (options: OptionValues, context: InvocationContext): AnkiConfig => {
  const url =
    optionString(options, "anki-connect") ??
    context.env["ANKI_CONNECT_URL"] ??
    "http://localhost:8765";
  try {
    new URL(url);
  } catch {
    throw new CliUsageError("--anki-connect must be a valid URL");
  }
  return {
    url,
    apiKey: context.env["ANKI_CONNECT_API_KEY"],
    apiVersion: positiveInteger(
      context.env["ANKI_CONNECT_API_VERSION"],
      6,
      "ANKI_CONNECT_API_VERSION",
    ),
    timeout: positiveInteger(context.env["ANKI_CONNECT_TIMEOUT"], 5000, "ANKI_CONNECT_TIMEOUT"),
    readOnly:
      options["read-only"] === true ||
      context.env["READ_ONLY"] === "true" ||
      context.env["READ_ONLY"] === "1",
    logLevel: logLevel(context.env["LOG_LEVEL"]),
  };
};
