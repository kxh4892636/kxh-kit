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
      "3b525d7aae83656c71b82c720ae9cf4255cd903430e7cab004a01fe9cf730a34",
    );
  });
});
