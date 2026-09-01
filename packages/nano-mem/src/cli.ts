import { Command, CommanderError } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { asCliError, CliError, CliErrorKind } from "./cli-error.js";
import { type CliIo, writeError, writeSuccess } from "./json-output.js";
import { nodeRuntime, type RuntimeDependencies } from "./runtime.js";

export interface CommandContext {
  input: CliInput;
  respond: (data: unknown) => void;
  runtime: RuntimeDependencies;
}

export type CommandRegistrar = (program: Command, context: CommandContext) => void;

export interface CliInput {
  readStdin: () => Promise<string>;
  stdinIsTerminal: boolean;
}

export interface RunCliOptions {
  argumentsList?: string[];
  input?: CliInput;
  io?: CliIo;
  registrars?: readonly CommandRegistrar[];
  runtime?: RuntimeDependencies;
}

const defaultIo: CliIo = {
  stderr: process.stderr.write.bind(process.stderr),
  stdout: process.stdout.write.bind(process.stdout),
};

const readProcessStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
};

const defaultInput: CliInput = {
  readStdin: readProcessStdin,
  stdinIsTerminal: process.stdin.isTTY === true,
};

const extractPretty = (argumentsList: string[]): { argumentsList: string[]; pretty: boolean } => {
  const retained: string[] = [];
  let optionsEnded = false;
  let pretty = false;
  for (const argument of argumentsList) {
    if (argument === "--") optionsEnded = true;
    if (!optionsEnded && argument === "--pretty") pretty = true;
    else retained.push(argument);
  }
  return { argumentsList: retained, pretty };
};

const rootOption = (argumentsList: string[]): string | undefined =>
  argumentsList.find((argument: string): boolean => argument !== "--pretty");

export const createProgram = (): Command =>
  new Command()
    .name("nm")
    .description(packageJson.description)
    .version(packageJson.version)
    .option("--pretty", "Pretty-print JSON output")
    .enablePositionalOptions()
    .showHelpAfterError(false)
    .showSuggestionAfterError(false)
    .exitOverride()
    .configureOutput({
      writeErr: (): void => undefined,
      writeOut: (): void => undefined,
    });

interface CliApplication {
  program: Command;
  readCommanderOutput: () => string;
  readResponse: () => unknown;
}

const noResponse = Symbol("no-response");

const createApplication = (
  input: CliInput,
  runtime: RuntimeDependencies,
  registrars: readonly CommandRegistrar[],
): CliApplication => {
  const program = createProgram();
  let commanderOutput = "";
  program.configureOutput({
    writeErr: (text: string): void => {
      commanderOutput += text;
    },
    writeOut: (text: string): void => {
      commanderOutput += text;
    },
  });
  let response: unknown = noResponse;
  const context: CommandContext = {
    input,
    respond: (data: unknown): void => {
      if (data === undefined) {
        throw new CliError(
          "MISSING_COMMAND_RESPONSE",
          "A command response must define data.",
          CliErrorKind.runtime,
        );
      }
      if (response !== noResponse) {
        throw new CliError(
          "DUPLICATE_COMMAND_RESPONSE",
          "A command may produce only one response.",
          CliErrorKind.runtime,
        );
      }
      response = data;
    },
    runtime,
  };
  for (const register of registrars) register(program, context);
  return {
    program,
    readCommanderOutput: (): string => commanderOutput,
    readResponse: (): unknown => response,
  };
};

const commanderError = (error: CommanderError): CliError =>
  new CliError("USAGE_ERROR", error.message, CliErrorKind.usage, "Run nm --help for usage.");

export const runCli = async (options: RunCliOptions = {}): Promise<number> => {
  const io = options.io ?? defaultIo;
  let application: CliApplication | undefined;
  let pretty = false;
  try {
    const extracted = extractPretty(options.argumentsList ?? process.argv.slice(2));
    pretty = extracted.pretty;
    application = createApplication(
      options.input ?? defaultInput,
      options.runtime ?? nodeRuntime(),
      options.registrars ?? [],
    );
    const { program } = application;
    const firstOption = rootOption(extracted.argumentsList);
    if (extracted.argumentsList.length === 0 || firstOption === "--help" || firstOption === "-h") {
      writeSuccess(io, { command: "nm", usage: program.helpInformation() }, pretty);
      return 0;
    }
    if (firstOption === "--version" || firstOption === "-V") {
      writeSuccess(io, { version: packageJson.version }, pretty);
      return 0;
    }
    await program.parseAsync(extracted.argumentsList, { from: "user" });
    const response = application.readResponse();
    if (response === noResponse) {
      throw new CliError(
        "MISSING_COMMAND_RESPONSE",
        "The command completed without a response.",
        CliErrorKind.runtime,
      );
    }
    writeSuccess(io, response, pretty);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError && error.code === "commander.helpDisplayed") {
      writeSuccess(io, { command: "nm", usage: application?.readCommanderOutput() ?? "" }, pretty);
      return 0;
    }
    const cliError = error instanceof CommanderError ? commanderError(error) : asCliError(error);
    writeError(io, cliError, pretty);
    return cliError.kind === CliErrorKind.usage ? 2 : 1;
  }
};
