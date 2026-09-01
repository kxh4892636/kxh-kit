import { access, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { command, group, option } from "../../../cli/definition";
import { CliUsageError } from "../../../cli/errors";
import type {
  CommandGroup,
  InvocationContext,
  JsonOutput,
  JsonValue,
  LeafCommand,
  OptionValues,
  PreparedMutation,
} from "../../../cli/types";
import type { Logger } from "../logger";
import { JsonError } from "../errors";
import type { AnkiPort } from "../port";
import { connection, loggerFor, mutation, toJson, type AnkiDependencies } from "../runtime";
import { deleteMedia, listMedia, retrieveMedia, storeMedia } from "./media-operations";
import {
  mediaFileConfig,
  mediaUrlConfig,
  sanitizeMediaFilename,
  validateMediaFilePath,
  validateMediaUrl,
} from "./media-validation";

const requiredText = (value: unknown, flag: string): string => {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") throw new CliUsageError(`${flag} requires a non-empty value`);
  return text;
};
const logFileError = (logger: Logger, action: string, path: string, error: unknown): void =>
  logger.warn(
    `${action} "${path}" failed: ${error instanceof Error ? error.message : String(error)}`,
  );
const accessSource = async (
  path: string,
  dependencies: AnkiDependencies,
  logger: Logger,
): Promise<void> => {
  try {
    await (dependencies.accessFile?.(path) ?? access(path));
  } catch (error: unknown) {
    logFileError(logger, "Accessing", path, error);
    throw new CliUsageError(`Unable to access media file: ${path}`);
  }
};
const writeOutput = async (
  path: string,
  data: string,
  dependencies: AnkiDependencies,
  logger: Logger,
): Promise<void> => {
  try {
    const bytes = Buffer.from(data, "base64");
    await (dependencies.writeFile?.(path, bytes) ?? writeFile(path, bytes));
  } catch (error: unknown) {
    logFileError(logger, "Writing", path, error);
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "retrieveMediaFile",
      hint: "Make sure Anki is running and the filename is valid",
    });
  }
};
const removeSource = async (
  path: string,
  dependencies: AnkiDependencies,
  logger: Logger,
): Promise<void> => {
  try {
    await (dependencies.removeFile?.(path) ?? rm(path));
  } catch (error: unknown) {
    logFileError(logger, "Deleting", path, error);
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "storeMediaFile",
      hint: "Make sure Anki is running and the source is valid",
    });
  }
};

const createListCommand = (dependencies: AnkiDependencies): LeafCommand =>
  command("list", "List media files", [option.string("pattern", "Glob pattern", {})], {
    kind: "query",
    run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> =>
      toJson(
        listMedia(
          connection(dependencies, options, context).port,
          typeof options["pattern"] === "string" ? options["pattern"] : undefined,
        ),
      ),
  });

const createGetCommand = (dependencies: AnkiDependencies): LeafCommand =>
  command(
    "get",
    "Retrieve a media file",
    [
      option.string("filename", "Media filename", { required: true }),
      option.string("out", "Write decoded data to this path", {}),
    ],
    {
      kind: "conditional",
      mode: (options: OptionValues): "mutation" | "query" =>
        typeof options["out"] === "string" ? "mutation" : "query",
      run: async (options: OptionValues, context: InvocationContext): Promise<JsonOutput> => {
        const filename = sanitizeMediaFilename(requiredText(options["filename"], "--filename"));
        return toJson(retrieveMedia(connection(dependencies, options, context).port, filename));
      },
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const filename = sanitizeMediaFilename(requiredText(options["filename"], "--filename"));
        const out =
          typeof options["out"] === "string" ? resolve(context.cwd, options["out"]) : undefined;
        if (out === undefined) throw new CliUsageError("--out is required for file output");
        const result = await retrieveMedia(
          connection(dependencies, options, context).port,
          filename,
        );
        const found = result["found"] === true && typeof result["data"] === "string";
        const base = mutation(
          "retrieveMediaFileToDisk",
          options,
          context,
          dependencies,
          { filename, out },
          async (_port: AnkiPort, logger: Logger): Promise<JsonOutput> => {
            if (found) await writeOutput(out, result["data"] as string, dependencies, logger);
            return toJson(Promise.resolve(result));
          },
        );
        return {
          ...base,
          preview: {
            actions: [{ action: "retrieveMediaFile", params: { filename } }],
            files: found ? [{ action: "write", path: out }] : [],
          },
        };
      },
    },
  );

const storeOptions = [
  option.string("file", "Local media file", { conflicts: ["url", "data"] }),
  option.string("url", "Public HTTP(S) URL", { conflicts: ["file", "data"] }),
  option.string("data", "Base64 media content", { conflicts: ["file", "url"] }),
  option.string("filename", "Stored filename", {}),
  option.boolean("delete-original", "Delete the local source after storing", {}),
] as const;

interface StoreSource {
  readonly derivedName?: string;
  readonly file?: string;
  readonly value: Readonly<Record<string, JsonValue>>;
}

const resolveStoreSource = async (
  options: OptionValues,
  context: InvocationContext,
  dependencies: AnkiDependencies,
  logger: Logger,
): Promise<StoreSource> => {
  const sources = ["file", "url", "data"].filter(
    (name: string): boolean => typeof options[name] === "string",
  );
  if (sources.length !== 1) throw new CliUsageError("Must provide exactly one media source");
  try {
    if (typeof options["file"] === "string") {
      const file = validateMediaFilePath(
        resolve(context.cwd, options["file"]),
        mediaFileConfig(context.env),
      ).resolvedPath;
      await accessSource(file, dependencies, logger);
      return { value: { path: file }, derivedName: basename(file), file };
    }
    if (typeof options["url"] === "string") {
      const url = requiredText(options["url"], "--url");
      const parsed = await validateMediaUrl(url, mediaUrlConfig(context.env), logger);
      return { value: { url }, derivedName: basename(new URL(url).pathname) || parsed.hostname };
    }
    return { value: { data: requiredText(options["data"], "--data") } };
  } catch (error: unknown) {
    if (error instanceof CliUsageError) throw error;
    throw new CliUsageError(error instanceof Error ? error.message : String(error));
  }
};

const createStoreCommand = (dependencies: AnkiDependencies): LeafCommand =>
  command("store", "Store a media file", storeOptions, {
    kind: "mutation",
    prepare: async (
      options: OptionValues,
      context: InvocationContext,
    ): Promise<PreparedMutation> => {
      const source = await resolveStoreSource(
        options,
        context,
        dependencies,
        loggerFor(options, context),
      );
      if (source.file === undefined && options["delete-original"] === true) {
        throw new CliUsageError("--delete-original requires --file");
      }
      const filename = sanitizeMediaFilename(
        typeof options["filename"] === "string"
          ? requiredText(options["filename"], "--filename")
          : requiredText(source.derivedName, "--filename"),
      );
      const base = mutation(
        "storeMediaFile",
        options,
        context,
        dependencies,
        { filename, deleteExisting: true, ...source.value },
        async (port: AnkiPort, logger: Logger): Promise<JsonOutput> => {
          const result = await storeMedia(port, filename, source.value);
          if (source.file !== undefined && options["delete-original"] === true)
            await removeSource(source.file, dependencies, logger);
          return toJson(Promise.resolve(result));
        },
      );
      if (source.file === undefined || options["delete-original"] !== true) return base;
      return {
        ...base,
        preview: {
          actions: [
            {
              action: "storeMediaFile",
              params: { filename, deleteExisting: true, ...source.value },
            },
          ],
          files: [{ action: "delete", path: source.file }],
        },
      };
    },
  });

const createDeleteCommand = (dependencies: AnkiDependencies): LeafCommand =>
  command(
    "delete",
    "Delete a media file",
    [
      option.string("filename", "Media filename", { required: true }),
      option.boolean("yes", "Confirm permanent deletion", { required: true }),
    ],
    {
      kind: "mutation",
      prepare: async (
        options: OptionValues,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        const filename = sanitizeMediaFilename(requiredText(options["filename"], "--filename"));
        return mutation(
          "deleteMediaFile",
          options,
          context,
          dependencies,
          { filename },
          async (port: AnkiPort, _logger: Logger): Promise<JsonOutput> =>
            toJson(deleteMedia(port, filename)),
        );
      },
    },
  );

export const createMediaGroup = (dependencies: AnkiDependencies): CommandGroup =>
  group("media", "Manage collection media", [
    createListCommand(dependencies),
    createGetCommand(dependencies),
    createStoreCommand(dependencies),
    createDeleteCommand(dependencies),
  ]);
