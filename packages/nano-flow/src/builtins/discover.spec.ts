import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { builtinModules } from "./discover";

describe("builtin discovery", (): void => {
  test("returns every eagerly discovered command through a factory", (): void => {
    const commands = builtinModules.map((factory) => factory());
    expect(commands.map(({ name }) => name).sort()).toEqual([
      "anki",
      "fixture",
      "self",
      "workspace",
    ]);
    expect(commands.every(({ kind }) => kind === "group")).toBe(true);
  });

  test("keeps the complete shipped command contract stable", (): void => {
    const commands = builtinModules.map((factory) => factory());
    const contract = JSON.stringify(commands);
    expect(createHash("sha256").update(contract).digest("hex")).toBe(
      "69350038d128ce11f773a3e6df19b7b4adada1902b61dfe25bdbbfe3ee34e0cc",
    );
  });
});
