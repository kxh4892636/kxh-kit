import type {
  BooleanOption,
  CommandGroup,
  CommandNode,
  LeafCommand,
  MutationOperation,
  QueryOperation,
  StringOption,
  ValuesFromOptions,
} from "./types";

interface OptionSettings {
  readonly conflicts?: readonly string[];
  readonly required?: boolean;
}

interface StringOptionSettings extends OptionSettings {
  readonly multiple?: boolean;
  readonly placeholder?: string;
}

export const option = {
  boolean: <const Name extends string, const Settings extends OptionSettings>(
    name: Name,
    description: string,
    settings: Settings,
  ): BooleanOption & { readonly name: Name } & Settings => ({
    kind: "boolean",
    name,
    description,
    ...settings,
  }),
  string: <const Name extends string, const Settings extends StringOptionSettings>(
    name: Name,
    description: string,
    settings: Settings,
  ): StringOption & { readonly name: Name } & Settings => ({
    kind: "string",
    name,
    description,
    ...settings,
  }),
};

export const command = <const Options extends readonly (BooleanOption | StringOption)[]>(
  name: string,
  description: string,
  options: Options,
  operation:
    | (Omit<MutationOperation, "prepare"> & {
        prepare(
          options: ValuesFromOptions<Options>,
          context: Parameters<MutationOperation["prepare"]>[1],
        ): ReturnType<MutationOperation["prepare"]>;
      })
    | (Omit<QueryOperation, "run"> & {
        run(
          options: ValuesFromOptions<Options>,
          context: Parameters<QueryOperation["run"]>[1],
        ): ReturnType<QueryOperation["run"]>;
      }),
): LeafCommand => ({
  kind: "command",
  name,
  description,
  options,
  operation: operation as unknown as MutationOperation | QueryOperation,
});

export const group = (
  name: string,
  description: string,
  children: readonly CommandNode[],
  options: readonly (BooleanOption | StringOption)[] = [],
): CommandGroup => ({ kind: "group", name, description, children, options });
