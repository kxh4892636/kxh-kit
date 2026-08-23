import { command } from "../../../cli/definition";
import type {
  InvocationContext,
  JsonOutput,
  LeafCommand,
  OptionValues,
  PreparedMutation,
} from "../../../cli/types";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import { mutation, toJson, type AnkiDependencies } from "../runtime";
import { runSync } from "./sync-command";

export const createSyncCommand = (dependencies: AnkiDependencies): LeafCommand =>
  command("sync", "Synchronize with AnkiWeb", [], {
    kind: "mutation",
    prepare: async (
      options: OptionValues,
      context: InvocationContext,
    ): Promise<PreparedMutation> => {
      const now = (): Date => dependencies.now?.() ?? new Date();
      return mutation(
        "sync",
        options,
        context,
        dependencies,
        {},
        async (port: AnkiPort, _logger: Logger): Promise<JsonOutput> => toJson(runSync(port, now)),
      );
    },
  });
