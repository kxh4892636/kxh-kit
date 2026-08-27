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
      "9824ffbbaf96c5530fb5cbed59c6ab8f377f1c559b2176f3d142b0d444b8ff84",
    );
  });
});
