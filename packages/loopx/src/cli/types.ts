export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export type JsonOutput = JsonValue | AsyncIterable<JsonValue>;

export interface TextReader {
  readLine(): Promise<null | string>;
}

export interface TextWriter {
  write(chunk: string): void;
}

export interface InvocationContext {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly signal: AbortSignal;
  readonly stdin: TextReader;
  readonly debug: boolean;
}

export type OptionValues = Readonly<Record<string, boolean | string | undefined>>;

interface BaseOption {
  readonly name: string;
  readonly description: string;
  readonly conflicts?: readonly string[];
  readonly required?: boolean;
}

export interface BooleanOption extends BaseOption {
  readonly kind: "boolean";
}

export interface StringOption extends BaseOption {
  readonly kind: "string";
  readonly placeholder?: string;
}

export type CommandOption = BooleanOption | StringOption;

type DefinedOptionValue<Definition extends CommandOption> = Definition extends StringOption
  ? string
  : boolean;

export type ValuesFromOptions<Definitions extends readonly CommandOption[]> = Readonly<{
  [Definition in Definitions[number] as Definition["name"]]: Definition["required"] extends true
    ? DefinedOptionValue<Definition>
    : DefinedOptionValue<Definition> | undefined;
}>;

export interface QueryOperation {
  readonly kind: "query";
  run(options: OptionValues, context: InvocationContext): Promise<JsonOutput>;
}

export interface PreparedMutation {
  readonly preview: JsonValue;
  commit(): Promise<JsonOutput>;
}

export interface MutationOperation {
  readonly kind: "mutation";
  prepare(options: OptionValues, context: InvocationContext): Promise<PreparedMutation>;
}

export type Operation = MutationOperation | QueryOperation;

export interface LeafCommand {
  readonly kind: "command";
  readonly name: string;
  readonly description: string;
  readonly options: readonly CommandOption[];
  readonly operation: Operation;
}

export interface CommandGroup {
  readonly kind: "group";
  readonly name: string;
  readonly description: string;
  readonly children: readonly CommandNode[];
}

export type CommandNode = CommandGroup | LeafCommand;
export type BuiltinCommand = CommandGroup;
export type BuiltinModuleFactory = () => BuiltinCommand;
