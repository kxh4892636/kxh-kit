import type { BuiltinCommand } from "../../cli/types";
import { createAnkiCommand } from "./anki-command";
import type { AnkiConfig } from "./config";
import { HttpAnkiPort } from "./http-anki-port";
import type { Logger } from "./logger";
import type { AnkiPort } from "./port";

const ankiCommand: BuiltinCommand = createAnkiCommand({
  connect: (config: AnkiConfig, logger: Logger): AnkiPort => new HttpAnkiPort(config, logger),
});

export default ankiCommand;
