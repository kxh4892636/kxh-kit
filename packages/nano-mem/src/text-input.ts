import { CliError, CliErrorKind } from "./cli-error.js";

export interface TextInputRequest {
  positional?: string;
  readStdin: () => Promise<string>;
  stdinIsTerminal: boolean;
}

export const resolveOptionalTextInput = async (
  request: TextInputRequest,
): Promise<string | undefined> => {
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
  return value === "" ? undefined : value;
};

export const resolveTextInput = async (request: TextInputRequest): Promise<string> => {
  const value = await resolveOptionalTextInput(request);
  if (value === undefined) {
    throw new CliError(
      "EMPTY_TEXT_INPUT",
      "Text input cannot be empty.",
      CliErrorKind.usage,
      "Pass text as an argument or pipe it through stdin.",
    );
  }
  return value;
};
