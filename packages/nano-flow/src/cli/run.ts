import { Command, CommanderError, Option } from "commander";
import packageMetadata from "../../package.json" with { type: "json" };
import { CliUsageError, DefinitionError, isUsageError, toErrorJson } from "./errors";
import type {
  BuiltinCommand,
  BuiltinModuleFactory,
  CommandNode,
  InvocationContext,
  JsonOutput,
  JsonValue,
  LeafCommand,
  CommandOption,
  OptionValues,
  QueryOperation,
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
  readonly scoped: OptionValues;
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
  return { argv: rest, globals: { compact, debug, dryRun }, scoped: {} };
};

const scanScopedOptions = (
  scanned: ScannedArguments,
  builtins: readonly BuiltinCommand[],
): ScannedArguments => {
  const rootName = scanned.argv[0];
  const definitions =
    builtins.find((builtin: BuiltinCommand): boolean => builtin.name === rootName)?.options ?? [];
  if (definitions.length === 0) return scanned;
  const byFlag = new Map(
    definitions.map((definition): [string, CommandOption] => [`--${definition.name}`, definition]),
  );
  const argv: string[] = [];
  const scoped: Record<string, boolean | readonly string[] | string | undefined> = {};
  for (let index = 0; index < scanned.argv.length; index += 1) {
    const argument = scanned.argv[index];
    if (argument === undefined) continue;
    const separator = argument.indexOf("=");
    const flag = separator === -1 ? argument : argument.slice(0, separator);
    const definition = byFlag.get(flag);
    if (definition === undefined) {
      argv.push(argument);
      continue;
    }
    if (definition.kind === "boolean") {
      if (separator !== -1) throw new CliUsageError(`${flag} does not accept a value`);
      scoped[definition.name] = true;
      continue;
    }
    const value = separator === -1 ? scanned.argv[index + 1] : argument.slice(separator + 1);
    if (value === undefined || value.startsWith("-"))
      throw new CliUsageError(`${flag} requires a value`);
    scoped[definition.name] = value;
    if (separator === -1) index += 1;
  }
  return { ...scanned, argv, scoped };
};

const validateOptions = (definitions: readonly CommandOption[], path: string): void => {
  const names = new Set<string>();
  for (const definition of definitions) {
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
  for (const definition of definitions) {
    for (const conflict of definition.conflicts ?? []) {
      if (!names.has(conflict)) {
        throw new DefinitionError(`Unknown conflict at ${path}: --${conflict}`);
      }
    }
  }
};

const validateChildren = (
  children: readonly CommandNode[],
  parent: string,
  inheritedOptions: readonly CommandOption[] = [],
): void => {
  const names = new Set<string>();
  for (const child of children) {
    const path = `${parent} ${child.name}`.trim();
    if (!validName.test(child.name)) throw new DefinitionError(`Invalid command path: ${path}`);
    if (names.has(child.name)) throw new DefinitionError(`Duplicate command path: ${path}`);
    names.add(child.name);
    if (child.kind === "group") {
      if (child.children.length === 0) throw new DefinitionError(`Empty command group: ${path}`);
      validateOptions([...inheritedOptions, ...child.options], path);
      validateChildren(child.children, path, [...inheritedOptions, ...child.options]);
    } else {
      validateOptions([...inheritedOptions, ...child.options], path);
      const operation = child.operation as Partial<LeafCommand["operation"]>;
      if (operation.kind === "query" && typeof operation.run !== "function") {
        throw new DefinitionError(`Query is missing run stage: ${path}`);
      }
      if (operation.kind === "mutation" && typeof operation.prepare !== "function") {
        throw new DefinitionError(`Mutation is missing prepare stage: ${path}`);
      }
      if (
        operation.kind === "conditional" &&
        (typeof operation.prepare !== "function" ||
          typeof operation.run !== "function" ||
          typeof operation.mode !== "function")
      ) {
        throw new DefinitionError(`Conditional operation is incomplete: ${path}`);
      }
      if (
        operation.kind !== "query" &&
        operation.kind !== "mutation" &&
        operation.kind !== "conditional"
      ) {
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

const runtimeOptionValue = (
  definition: CommandOption,
  values: Readonly<Record<string, boolean | readonly string[] | string | undefined>>,
): boolean | readonly string[] | string | undefined => {
  if (definition.kind === "boolean" && definition.name.startsWith("no-")) {
    return values[optionKey(definition.name.slice(3))] === false ? true : undefined;
  }
  return values[optionKey(definition.name)];
};

const addOptions = (target: Command, definitions: readonly CommandOption[]): void => {
  for (const definition of definitions) {
    const value =
      definition.kind === "string"
        ? ` <${definition.placeholder ?? "value"}${definition.multiple === true ? "..." : ""}>`
        : "";
    const description =
      definition.required === true
        ? `${definition.description} (required)`
        : definition.description;
    const commanderOption = new Option(`--${definition.name}${value}`, description);
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
  scopedValues: OptionValues,
  inheritedOptions: readonly CommandOption[] = [],
): void => {
  const target = parent.command(node.name).description(node.description);
  addGlobalHelpOptions(target);
  if (node.kind === "group") {
    addOptions(target, node.options);
    const scopedOptions = [...inheritedOptions, ...node.options];
    for (const child of node.children)
      addNode(target, child, request, globals, scopedValues, scopedOptions);
    return;
  }

  addOptions(target, node.options);
  target.action(async (): Promise<void> => {
    const rawOptions =
      target.optsWithGlobals<Record<string, boolean | readonly string[] | string | undefined>>();
    const definitions = [...inheritedOptions, ...node.options];
    const options: OptionValues = Object.fromEntries(
      definitions.map(
        (
          definition: CommandOption,
        ): readonly [string, boolean | readonly string[] | string | undefined] => [
          definition.name,
          Object.hasOwn(scopedValues, definition.name)
            ? scopedValues[definition.name]
            : runtimeOptionValue(definition, rawOptions),
        ],
      ),
    );
    const context: InvocationContext = {
      cwd: request.cwd,
      env: request.env,
      signal: request.signal,
      stdin: request.stdin,
      debug: globals.debug,
      dryRun: globals.dryRun,
    };
    const queryMode =
      node.operation.kind === "query" ||
      (node.operation.kind === "conditional" && node.operation.mode(options) === "query");
    if (queryMode) {
      await writeOutput(
        await (node.operation as QueryOperation).run(options, context),
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
  scopedValues: OptionValues,
): Command => {
  const program = new Command()
    .name("nnf")
    .description("Nano Flow unified command line interface")
    .enablePositionalOptions()
    .version(packageMetadata.version, "--version");
  addGlobalHelpOptions(program);
  program.configureOutput({
    writeOut: (chunk: string): void => request.stdout.write(chunk),
    writeErr: (): void => undefined,
  });
  for (const builtin of builtins) addNode(program, builtin, request, globals, scopedValues);
  applyExitOverride(program);
  return program;
};

export const runCli = async (
  request: CliRequest,
  modules: readonly BuiltinModuleFactory[],
): Promise<number> => {
  try {
    const builtins = modules.map((factory: BuiltinModuleFactory): BuiltinCommand => factory());
    validateBuiltins(builtins);
    const scanned = scanScopedOptions(scanGlobals(request.argv), builtins);
    const program = createProgram(request, scanned.globals, builtins, scanned.scoped);
    await program.parseAsync(scanned.argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return 0;
    const scanned = scanGlobals(request.argv);
    const code = isUsageError(error) ? 2 : 1;
    request.stderr.write(
      `${JSON.stringify(toErrorJson(error, scanned.globals.debug), null, scanned.globals.compact ? 0 : 2)}\n`,
    );
    return code;
  }
};
