import { Command, CommanderError, Option } from "commander";
import packageMetadata from "../../package.json" with { type: "json" };
import { DefinitionError, isUsageError, toErrorJson } from "./errors";
import type {
  BuiltinCommand,
  BuiltinModuleFactory,
  CommandNode,
  InvocationContext,
  JsonOutput,
  JsonValue,
  LeafCommand,
  OptionValues,
  TextReader,
  TextWriter,
} from "./types";

export interface CliRequest {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly signal: AbortSignal;
  readonly stdin: TextReader;
  readonly stdout: TextWriter;
  readonly stderr: TextWriter;
}

interface GlobalOptions {
  readonly compact: boolean;
  readonly debug: boolean;
  readonly dryRun: boolean;
}

interface ScannedArguments {
  readonly argv: readonly string[];
  readonly globals: GlobalOptions;
}

const reservedOptions = new Set(["compact", "debug", "dry-run", "help"]);
const validName = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

const scanGlobals = (argv: readonly string[]): ScannedArguments => {
  const rest: string[] = [];
  let compact = false;
  let debug = false;
  let dryRun = false;
  for (const argument of argv) {
    if (argument === "--compact") compact = true;
    else if (argument === "--debug") debug = true;
    else if (argument === "--dry-run") dryRun = true;
    else rest.push(argument);
  }
  return { argv: rest, globals: { compact, debug, dryRun } };
};

const validateOptions = (node: LeafCommand, path: string): void => {
  const names = new Set<string>();
  for (const definition of node.options) {
    if (!validName.test(definition.name)) {
      throw new DefinitionError(`Invalid option name at ${path}: ${definition.name}`);
    }
    if (reservedOptions.has(definition.name)) {
      throw new DefinitionError(`Reserved option at ${path}: --${definition.name}`);
    }
    if (names.has(definition.name)) {
      throw new DefinitionError(`Duplicate option at ${path}: --${definition.name}`);
    }
    names.add(definition.name);
  }
  for (const definition of node.options) {
    for (const conflict of definition.conflicts ?? []) {
      if (!names.has(conflict)) {
        throw new DefinitionError(`Unknown conflict at ${path}: --${conflict}`);
      }
    }
  }
};

const validateChildren = (children: readonly CommandNode[], parent: string): void => {
  const names = new Set<string>();
  for (const child of children) {
    const path = `${parent} ${child.name}`.trim();
    if (!validName.test(child.name)) throw new DefinitionError(`Invalid command path: ${path}`);
    if (names.has(child.name)) throw new DefinitionError(`Duplicate command path: ${path}`);
    names.add(child.name);
    if (child.kind === "group") {
      if (child.children.length === 0) throw new DefinitionError(`Empty command group: ${path}`);
      validateChildren(child.children, path);
    } else {
      validateOptions(child, path);
      const operation = child.operation as Partial<LeafCommand["operation"]>;
      if (operation.kind === "query" && typeof operation.run !== "function") {
        throw new DefinitionError(`Query is missing run stage: ${path}`);
      }
      if (operation.kind === "mutation" && typeof operation.prepare !== "function") {
        throw new DefinitionError(`Mutation is missing prepare stage: ${path}`);
      }
      if (operation.kind !== "query" && operation.kind !== "mutation") {
        throw new DefinitionError(`Unknown operation at: ${path}`);
      }
    }
  }
};

const validateBuiltins = (builtins: readonly BuiltinCommand[]): void => {
  validateChildren(builtins, "");
};

const optionKey = (name: string): string =>
  name.replace(/-([a-z0-9])/gu, (_match: string, value: string): string => value.toUpperCase());

const addOptions = (target: Command, node: LeafCommand): void => {
  for (const definition of node.options) {
    const value = definition.kind === "string" ? ` <${definition.placeholder ?? "value"}>` : "";
    const commanderOption = new Option(`--${definition.name}${value}`, definition.description);
    if (definition.required === true) commanderOption.makeOptionMandatory();
    if (definition.conflicts !== undefined) {
      commanderOption.conflicts(definition.conflicts.map(optionKey));
    }
    target.addOption(commanderOption);
  }
};

const addGlobalHelpOptions = (target: Command): void => {
  target
    .addOption(new Option("--dry-run", "Preview mutations without committing"))
    .addOption(new Option("--compact", "Write compact JSON"))
    .addOption(new Option("--debug", "Include diagnostic details in errors"));
};

const isEventStream = (output: JsonOutput): output is AsyncIterable<JsonValue> =>
  typeof output === "object" && output !== null && Symbol.asyncIterator in output;

const writeOutput = async (
  output: JsonOutput,
  writer: TextWriter,
  compact: boolean,
): Promise<void> => {
  if (isEventStream(output)) {
    for await (const event of output)
      writer.write(`${JSON.stringify(event, null, compact ? 0 : 2)}\n`);
    return;
  }
  writer.write(`${JSON.stringify(output, null, compact ? 0 : 2)}\n`);
};

const addNode = (
  parent: Command,
  node: CommandNode,
  request: CliRequest,
  globals: GlobalOptions,
): void => {
  const target = parent.command(node.name).description(node.description).enablePositionalOptions();
  addGlobalHelpOptions(target);
  if (node.kind === "group") {
    for (const child of node.children) addNode(target, child, request, globals);
    return;
  }

  addOptions(target, node);
  target.action(async (rawOptions: Record<string, boolean | string | undefined>): Promise<void> => {
    const options: OptionValues = Object.fromEntries(
      node.options.map((definition): readonly [string, boolean | string | undefined] => [
        definition.name,
        rawOptions[optionKey(definition.name)],
      ]),
    );
    const context: InvocationContext = {
      cwd: request.cwd,
      env: request.env,
      signal: request.signal,
      stdin: request.stdin,
      debug: globals.debug,
    };
    if (node.operation.kind === "query") {
      await writeOutput(
        await node.operation.run(options, context),
        request.stdout,
        globals.compact,
      );
      return;
    }
    const prepared = await node.operation.prepare(options, context);
    const output = globals.dryRun
      ? { success: true, dryRun: true, preview: prepared.preview }
      : await prepared.commit();
    await writeOutput(output, request.stdout, globals.compact);
  });
};

const applyExitOverride = (command: Command): void => {
  command.exitOverride();
  for (const child of command.commands) applyExitOverride(child);
};

const createProgram = (
  request: CliRequest,
  globals: GlobalOptions,
  builtins: readonly BuiltinCommand[],
): Command => {
  const program = new Command()
    .name("loopx")
    .description("LoopX unified command line interface")
    .enablePositionalOptions()
    .version(packageMetadata.version, "--version");
  addGlobalHelpOptions(program);
  program.configureOutput({
    writeOut: (chunk: string): void => request.stdout.write(chunk),
    writeErr: (): void => undefined,
  });
  for (const builtin of builtins) addNode(program, builtin, request, globals);
  applyExitOverride(program);
  return program;
};

export const runCli = async (
  request: CliRequest,
  modules: readonly BuiltinModuleFactory[],
): Promise<number> => {
  const scanned = scanGlobals(request.argv);
  try {
    const builtins = modules.map((factory: BuiltinModuleFactory): BuiltinCommand => factory());
    validateBuiltins(builtins);
    const program = createProgram(request, scanned.globals, builtins);
    await program.parseAsync(scanned.argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return 0;
    const code = isUsageError(error) ? 2 : 1;
    request.stderr.write(
      `${JSON.stringify(toErrorJson(error, scanned.globals.debug), null, scanned.globals.compact ? 0 : 2)}\n`,
    );
    return code;
  }
};
