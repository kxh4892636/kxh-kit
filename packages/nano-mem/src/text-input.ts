import { CliError, CliErrorKind } from "./cli-error.js";

export interface TextInputRequest {
  positional?: string;
  readStdin: () => Promise<string>;
  stdinIsTerminal: boolean;
}

export const resolveTextInput = async (request: TextInputRequest): Promise<string> => {
  const positional = request.positional?.trim();
  const stdin = request.stdinIsTerminal ? "" : (await request.readStdin()).trim();
  if (positional && stdin) {
    throw new CliError(
      "AMBIGUOUS_TEXT_INPUT",
      "Text must come from either the positional argument or stdin, not both.",
      CliErrorKind.usage,
    );
  }
  const value = positional || stdin;
  if (value === "") {
    throw new CliError(
      "EMPTY_TEXT_INPUT",
      "Text input cannot be empty.",
      CliErrorKind.usage,
      "Pass text as an argument or pipe it through stdin.",
    );
  }
  return value;
};
