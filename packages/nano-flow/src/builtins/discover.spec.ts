import { createHash } from "node:crypto";
import { describe, expect, test } from "vite-plus/test";
import { builtinModules } from "./discover";

describe("builtin discovery", (): void => {
  test("returns every eagerly discovered command through a factory", (): void => {
    const commands = builtinModules.map((factory) => factory());
    expect(commands.map(({ name }) => name).sort()).toEqual(["anki", "fixture", "self"]);
    expect(commands.every(({ kind }) => kind === "group")).toBe(true);
  });

  test("keeps the complete shipped command contract stable", (): void => {
    const commands = builtinModules.map((factory) => factory());
    const contract = JSON.stringify(commands);
    expect(createHash("sha256").update(contract).digest("hex")).toBe(
      "72f09e19759ec466eb98a42538226f10d9ecccf39e813258cc9c4afdfca98e77",
    );
  });
});
