import { describe, expect, test } from "vitest";
import { normalizeWorkspaceContract, verifyWorkspaceContract } from "./workspace-contracts";

describe("workspace contract normalization", (): void => {
  test.each(["C:\\Users\\alice\\AppData\\Local\\Temp\\fixture", "/tmp/fixture"])(
    "normalizes nested JSON paths independently of checkout: %s",
    (cwd: string): void => {
      const separator = cwd.startsWith("C:") ? "\\" : "/";
      const repository = `${cwd}${separator}repositories${separator}wiki`;
      const result = {
        code: 1,
        stderr:
          JSON.stringify({
            error: `Repository is materialized at ${repository}`,
            path: repository,
            nested: [JSON.stringify({ path: repository })],
          }) + "\n",
      };
      expect(JSON.parse(normalizeWorkspaceContract(result, cwd))).toEqual({
        code: 1,
        stderr:
          JSON.stringify({
            error: "Repository is materialized at <CWD>/repositories/wiki",
            path: "<CWD>/repositories/wiki",
            nested: [JSON.stringify({ path: "<CWD>/repositories/wiki" })],
          }) + "\n",
      });
    },
  );
  test("preserves meaningful output and rejects changed contracts", (): void => {
    const result = { code: 1, stderr: "not JSON\\n", stdout: "", value: null };
    expect(normalizeWorkspaceContract(result, "/tmp/fixture")).toBe(JSON.stringify(result));
    expect(() => verifyWorkspaceContract("command", result, "/tmp/fixture")).toThrow(
      "Workspace contract changed",
    );
    expect(normalizeWorkspaceContract({ code: 0 }, "/tmp/fixture")).not.toBe(
      normalizeWorkspaceContract({ code: 1 }, "/tmp/fixture"),
    );
  });
  test.each([
    "file:///C:/Users/alice/AppData/Local/Temp/nf-workspace-worktree-ABC123/wiki.git",
    "file:///tmp/nf-workspace-worktree-DEF456/wiki.git",
  ])("normalizes fixture remote URLs outside cwd: %s", (url: string): void => {
    expect(JSON.parse(normalizeWorkspaceContract({ url }, "/unused"))).toEqual({
      url: "file:///<TMP>/nf-workspace-worktree-<RAND>/wiki.git",
    });
  });
});
