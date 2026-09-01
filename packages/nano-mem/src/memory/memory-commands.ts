import type { Command } from "commander";
import { CliError, CliErrorKind } from "../cli-error.js";
import type { CommandContext, CommandRegistrar } from "../cli.js";
import { resolveOptionalTextInput, resolveTextInput } from "../text-input.js";
import { resolveMemoryContext, type MemoryContext } from "./memory-context.js";
import {
  createMemoryRepository,
  MemoryScope,
  type MemoryRecord,
  type MemoryRepository,
  type MemorySelector,
  type ReadScope,
} from "./memory-repository.js";
import { migrateMemoryDatabase } from "./memory-schema.js";

interface ScopeOptions {
  project?: string;
  scope: string;
}

interface AddOptions extends ScopeOptions {
  source?: string;
}

interface UpdateOptions extends ScopeOptions {
  source?: string;
}

interface DeleteOptions extends ScopeOptions {
  force?: boolean;
}

interface SearchOptions extends ScopeOptions {
  limit: string;
}

interface MemoryDto {
  content: string;
  createdAt: string;
  id: string;
  project: string | null;
  scope: MemoryScope;
  source: string | null;
  updatedAt: string;
}

const writeScope = (value: string): MemoryScope => {
  if (value === MemoryScope.project || value === MemoryScope.global) return value;
  throw new CliError("INVALID_SCOPE", "Write scope must be project or global.", CliErrorKind.usage);
};

const readScope = (value: string): ReadScope => {
  if (value === MemoryScope.project || value === MemoryScope.global || value === "all")
    return value;
  throw new CliError(
    "INVALID_SCOPE",
    "Read scope must be project, global, or all.",
    CliErrorKind.usage,
  );
};

const toDto = (memory: MemoryRecord): MemoryDto => ({
  content: memory.content,
  createdAt: new Date(memory.createdAtMs).toISOString(),
  id: memory.id,
  project: memory.scope === MemoryScope.project ? memory.projectId : null,
  scope: memory.scope,
  source: memory.source,
  updatedAt: new Date(memory.updatedAtMs).toISOString(),
});

const selector = (options: ScopeOptions, context: MemoryContext): MemorySelector => ({
  projectId: context.projectId,
  scope: readScope(options.scope),
});

const writeSelector = (options: ScopeOptions, context: MemoryContext): MemorySelector => ({
  projectId: context.projectId,
  scope: writeScope(options.scope),
});

const searchLimit = (value: string): number => {
  if (!/^\d+$/u.test(value)) {
    throw new CliError(
      "INVALID_LIMIT",
      "Search limit must be an integer from 1 to 50.",
      CliErrorKind.usage,
    );
  }
  const limit = Number(value);
  if (limit >= 1 && limit <= 50) return limit;
  throw new CliError(
    "INVALID_LIMIT",
    "Search limit must be an integer from 1 to 50.",
    CliErrorKind.usage,
  );
};

const withRepository = async <T>(
  commandContext: CommandContext,
  project: string | undefined,
  operation: (repository: MemoryRepository, context: MemoryContext) => Promise<T> | T,
): Promise<T> => {
  const memoryContext = await resolveMemoryContext(commandContext.runtime, project);
  commandContext.runtime.paths.ensureDirectory(memoryContext.dataDirectory);
  const database = commandContext.runtime.databaseFactory.open(memoryContext.databasePath);
  try {
    migrateMemoryDatabase(database);
    const repository = createMemoryRepository({
      database,
      now: commandContext.runtime.clock.now,
    });
    return await operation(repository, memoryContext);
  } finally {
    database.close();
  }
};

const addScopeOptions = (command: Command, defaultScope: ReadScope): Command =>
  command
    .option("--scope <scope>", "Memory scope", defaultScope)
    .option("--project <project>", "Override the current project identifier");

const registerAdd = (program: Command, context: CommandContext): void => {
  const command = addScopeOptions(
    program.command("add [content]").description("Add a memory"),
    MemoryScope.project,
  ).option("--source <source>", "Optional memory source");
  command.action(async (content: string | undefined): Promise<void> => {
    const options = command.opts<AddOptions>();
    const text = await resolveTextInput({
      ...context.input,
      ...(content === undefined ? {} : { positional: content }),
    });
    const result = await withRepository(
      context,
      options.project,
      (
        repository: MemoryRepository,
        memoryContext: MemoryContext,
      ): { created: boolean; memory: MemoryRecord } =>
        repository.add({
          content: text,
          projectId: memoryContext.projectId,
          scope: writeScope(options.scope),
          ...(options.source === undefined ? {} : { source: options.source }),
        }),
    );
    context.respond({ created: result.created, memory: toDto(result.memory) });
  });
};

const registerGet = (program: Command, context: CommandContext): void => {
  const command = addScopeOptions(program.command("get <id>").description("Get a memory"), "all");
  command.action(async (id: string): Promise<void> => {
    const options = command.opts<ScopeOptions>();
    const memory = await withRepository(
      context,
      options.project,
      (repository: MemoryRepository, memoryContext: MemoryContext): MemoryRecord =>
        repository.get(id, selector(options, memoryContext)),
    );
    context.respond(toDto(memory));
  });
};

const registerList = (program: Command, context: CommandContext): void => {
  const command = addScopeOptions(program.command("list").description("List memories"), "all");
  command.action(async (): Promise<void> => {
    const options = command.opts<ScopeOptions>();
    const memories = await withRepository(
      context,
      options.project,
      (repository: MemoryRepository, memoryContext: MemoryContext): readonly MemoryDto[] =>
        repository
          .list(selector(options, memoryContext))
          .map((memory: MemoryRecord): MemoryDto => toDto(memory)),
    );
    context.respond({ memories });
  });
};

const registerSearch = (program: Command, context: CommandContext): void => {
  const command = addScopeOptions(
    program.command("search [query]").description("Search active memories"),
    "all",
  ).option("--limit <count>", "Maximum memories to return", "10");
  command.action(async (query: string | undefined): Promise<void> => {
    const options = command.opts<SearchOptions>();
    const text = await resolveTextInput({
      ...context.input,
      ...(query === undefined ? {} : { positional: query }),
    });
    const memories = await withRepository(
      context,
      options.project,
      (repository: MemoryRepository, memoryContext: MemoryContext): readonly MemoryDto[] =>
        repository
          .search({
            limit: searchLimit(options.limit),
            query: text,
            selector: selector(options, memoryContext),
          })
          .map((memory: MemoryRecord): MemoryDto => toDto(memory)),
    );
    context.respond({ memories });
  });
};

const registerUpdate = (program: Command, context: CommandContext): void => {
  const command = addScopeOptions(
    program.command("update <id> [content]").description("Update a memory"),
    MemoryScope.project,
  ).option("--source <source>", "Replace the memory source");
  command.action(async (id: string, content: string | undefined): Promise<void> => {
    const options = command.opts<UpdateOptions>();
    const text = await resolveOptionalTextInput({
      ...context.input,
      ...(content === undefined ? {} : { positional: content }),
    });
    const memory = await withRepository(
      context,
      options.project,
      (repository: MemoryRepository, memoryContext: MemoryContext): MemoryRecord =>
        repository.update({
          id,
          selector: writeSelector(options, memoryContext),
          sourceSpecified: options.source !== undefined,
          ...(text === undefined ? {} : { content: text }),
          ...(options.source === undefined ? {} : { source: options.source }),
        }),
    );
    context.respond(toDto(memory));
  });
};

const registerDelete = (program: Command, context: CommandContext): void => {
  const command = addScopeOptions(
    program.command("delete <id>").description("Permanently delete a memory"),
    MemoryScope.project,
  ).option("--force", "Confirm permanent deletion");
  command.action(async (id: string): Promise<void> => {
    const options = command.opts<DeleteOptions>();
    const memory = await withRepository(
      context,
      options.project,
      (repository: MemoryRepository, memoryContext: MemoryContext): MemoryRecord =>
        repository.delete(id, writeSelector(options, memoryContext), options.force === true),
    );
    context.respond({ deleted: toDto(memory) });
  });
};

export const registerMemoryCommands: CommandRegistrar = (
  program: Command,
  context: CommandContext,
): void => {
  registerAdd(program, context);
  registerGet(program, context);
  registerList(program, context);
  registerSearch(program, context);
  registerUpdate(program, context);
  registerDelete(program, context);
};
