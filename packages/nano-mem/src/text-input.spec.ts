import { describe, expect, test, vi } from "vitest";
import { resolveTextInput } from "./text-input.js";

describe("text input contract", (): void => {
  test("uses a positional value for terminal stdin", async (): Promise<void> => {
    await expect(
      resolveTextInput({ positional: " memory ", readStdin: vi.fn(), stdinIsTerminal: true }),
    ).resolves.toBe("memory");
  });

  test("reads piped stdin when positional text is absent", async (): Promise<void> => {
    await expect(
      resolveTextInput({
        readStdin: async (): Promise<string> => " piped\n",
        stdinIsTerminal: false,
      }),
    ).resolves.toBe("piped");
  });

  test("rejects ambiguous positional and stdin input", async (): Promise<void> => {
    await expect(
      resolveTextInput({
        positional: "memory",
        readStdin: async (): Promise<string> => "piped",
        stdinIsTerminal: false,
      }),
    ).rejects.toMatchObject({ code: "AMBIGUOUS_TEXT_INPUT" });
  });

  test("accepts positional text when redirected stdin is empty", async (): Promise<void> => {
    await expect(
      resolveTextInput({
        positional: "from argument",
        readStdin: async (): Promise<string> => "",
        stdinIsTerminal: false,
      }),
    ).resolves.toBe("from argument");
  });

  test("uses valid stdin when positional text contains only whitespace", async (): Promise<void> => {
    await expect(
      resolveTextInput({
        positional: "  ",
        readStdin: async (): Promise<string> => "from stdin",
        stdinIsTerminal: false,
      }),
    ).resolves.toBe("from stdin");
  });

  test("rejects empty input", async (): Promise<void> => {
    await expect(
      resolveTextInput({ readStdin: async (): Promise<string> => "  ", stdinIsTerminal: false }),
    ).rejects.toMatchObject({ code: "EMPTY_TEXT_INPUT" });
  });
});
