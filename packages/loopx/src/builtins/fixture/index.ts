import { command, group, option } from "../../cli/definition";
import type {
  BuiltinCommand,
  JsonOutput,
  JsonValue,
  PreparedMutation,
  ValuesFromOptions,
} from "../../cli/types";

const echoOptions = [
  option.string("value", "Value to echo", { required: true }),
  option.boolean("upper", "Uppercase the value", { conflicts: ["lower"] }),
  option.boolean("lower", "Lowercase the value", { conflicts: ["upper"] }),
] as const;
type EchoOptions = ValuesFromOptions<typeof echoOptions>;

const mutationOptions = [option.string("value", "Value to mutate", { required: true })] as const;
type MutationOptions = ValuesFromOptions<typeof mutationOptions>;

const events = (): AsyncIterable<JsonValue> => {
  const values: readonly JsonValue[] = [{ event: "first" }, { event: "second" }];
  return {
    [Symbol.asyncIterator]: (): AsyncIterator<JsonValue> => {
      let index = 0;
      return {
        next: async (): Promise<IteratorResult<JsonValue>> => {
          const value = values[index];
          index += 1;
          return value === undefined ? { done: true, value: undefined } : { done: false, value };
        },
      };
    },
  };
};

const fixtureCommand: BuiltinCommand = group("fixture", "CLI contract fixture", [
  command("echo", "Echo a named value", echoOptions, {
    kind: "query",
    run: async (options: EchoOptions): Promise<JsonOutput> => {
      const { value } = options;
      if (options.upper === true) return { value: value.toUpperCase() };
      if (options.lower === true) return { value: value.toLowerCase() };
      return { value };
    },
  }),
  command("mutate", "Preview or commit a mutation", mutationOptions, {
    kind: "mutation",
    prepare: async (options: MutationOptions): Promise<PreparedMutation> => {
      const { value } = options;
      return {
        preview: { action: "mutate", value },
        commit: async (): Promise<JsonOutput> => ({ action: "mutate", committed: true, value }),
      };
    },
  }),
  command("stream", "Write an event stream", [], {
    kind: "query",
    run: async (): Promise<JsonOutput> => events(),
  }),
  command("fail", "Raise a runtime error", [], {
    kind: "query",
    run: async (): Promise<JsonOutput> => {
      throw new Error("fixture failed");
    },
  }),
]);

export default fixtureCommand;
