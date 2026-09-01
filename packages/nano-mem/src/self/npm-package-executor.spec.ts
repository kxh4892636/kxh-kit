import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { ProcessExecutor, ProcessRequest, ProcessResult } from "../runtime.js";
import { createNpmPackageExecutor } from "./npm-package-executor.js";

interface NpmScript {
  artifactVersions: Map<string, string>;
  globalRoot: string;
  installedVersion: string;
  packedInstalledVersion?: string;
  requests: ProcessRequest[];
  versionResponse: string;
  versionsResponse: string;
}

const roots: string[] = [];

const writePackage = (root: string, version: string): void => {
  const skill = join(root, "skills", "nano-mem");
  const distribution = join(root, "dist");
  mkdirSync(skill, { recursive: true });
  mkdirSync(distribution, { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "downloaded skill");
  writeFileSync(join(distribution, "main.mjs"), "// bundled CLI");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ bin: { nm: "dist/main.mjs" }, name: "@kxh4892636/nano-mem", version }),
  );
};

const scriptedProcess = (script: NpmScript): ProcessExecutor => ({
  execute: async (request: ProcessRequest): Promise<ProcessResult> => {
    script.requests.push(request);
    const argumentsList = request.argumentsList;
    if (argumentsList.at(-1) === "--version") {
      const entryPath = argumentsList[0] ?? "";
      const packageRoot = join(entryPath, "..", "..");
      const value = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
        version: string;
      };
      return {
        stderr: "",
        stdout: JSON.stringify({ data: { version: value.version }, ok: true }),
      };
    }
    if (argumentsList.includes("pack")) {
      const packageArgument = argumentsList[argumentsList.indexOf("pack") + 1] ?? "";
      const destination = argumentsList[argumentsList.indexOf("--pack-destination") + 1] ?? "";
      const version = packageArgument.startsWith("@kxh4892636/nano-mem@")
        ? packageArgument.slice(packageArgument.lastIndexOf("@") + 1)
        : (script.packedInstalledVersion ??
          (
            JSON.parse(readFileSync(join(packageArgument, "package.json"), "utf8")) as {
              version: string;
            }
          ).version);
      const filename = `nano-mem-${version}.tgz`;
      const archive = join(destination, filename);
      writeFileSync(archive, "package archive");
      script.artifactVersions.set(archive, version);
      return { stderr: "", stdout: JSON.stringify([{ filename }]) };
    }
    if (argumentsList.includes("view")) {
      return {
        stderr: "",
        stdout: argumentsList.includes("versions")
          ? script.versionsResponse
          : script.versionResponse,
      };
    }
    if (argumentsList.includes("install")) {
      const artifact = argumentsList.at(-1) ?? "";
      const version = script.artifactVersions.get(artifact);
      if (version === undefined) throw new Error("unknown package artifact");
      const prefix = argumentsList[argumentsList.indexOf("--prefix") + 1];
      if (argumentsList.includes("--prefix") && prefix !== undefined) {
        writePackage(join(prefix, "node_modules", "@kxh4892636", "nano-mem"), version);
      } else {
        script.installedVersion = version;
        writePackage(join(script.globalRoot, "@kxh4892636", "nano-mem"), version);
      }
      return { stderr: "", stdout: "" };
    }
    if (argumentsList.includes("root")) {
      return { stderr: "", stdout: script.globalRoot };
    }
    if (argumentsList.includes("list")) {
      return {
        stderr: "",
        stdout: JSON.stringify({
          dependencies: { "@kxh4892636/nano-mem": { version: script.installedVersion } },
        }),
      };
    }
    throw new Error(`unexpected request: ${request.command} ${argumentsList.join(" ")}`);
  },
});

const createScript = (): NpmScript => {
  const root = mkdtempSync(join(tmpdir(), "nano-mem-npm-executor-"));
  roots.push(root);
  const globalRoot = join(root, "global", "node_modules");
  writePackage(join(globalRoot, "@kxh4892636", "nano-mem"), "1.0.0");
  return {
    artifactVersions: new Map<string, string>(),
    globalRoot,
    installedVersion: "1.0.0",
    requests: [],
    versionResponse: JSON.stringify("2.0.0-beta.1"),
    versionsResponse: JSON.stringify(["1.0.0", "2.0.0-beta.1", "1.8.0"]),
  };
};

afterEach((): void => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("npm package resolution", (): void => {
  test("selects the newest stable version by default and reads its skill", async (): Promise<void> => {
    const script = createScript();
    const executor = createNpmPackageExecutor({
      platform: "linux",
      processExecutor: scriptedProcess(script),
    });
    const candidate = await executor.resolve(undefined);
    expect(candidate).toMatchObject({
      manifest: {
        files: [{ path: "SKILL.md" }],
        packageVersion: "1.8.0",
        skillName: "nano-mem",
      },
      version: "1.8.0",
    });
    expect(readViewTarget(script)).toBe("@kxh4892636/nano-mem");
    expect(
      script.requests.some(
        (request: ProcessRequest): boolean => request.argumentsList.at(-1) === "--version",
      ),
    ).toBe(false);
    const sourceDirectory = candidate.sourceDirectory;
    candidate.cleanup();
    expect(existsSync(sourceDirectory)).toBe(false);
  });

  test.each([
    "2.0.0-beta.1",
    "v2.0.0-beta.1",
    "next",
    "2024-lts",
    "1foo",
    "_next",
    "foo~bar",
    "foo!bar",
    "!foo",
    "-foo",
  ])(
    "resolves explicit selector %s without stable filtering",
    async (selector: string): Promise<void> => {
      const script = createScript();
      const executor = createNpmPackageExecutor({
        platform: "linux",
        processExecutor: scriptedProcess(script),
      });
      const candidate = await executor.resolve(selector);
      expect(candidate.version).toBe("2.0.0-beta.1");
      expect(readViewTarget(script)).toBe(`@kxh4892636/nano-mem@${selector}`);
      candidate.cleanup();
    },
  );
});

describe("npm package resolution failures", (): void => {
  test("rejects unsafe selectors before invoking npm", async (): Promise<void> => {
    const script = createScript();
    const executor = createNpmPackageExecutor({
      platform: "linux",
      processExecutor: scriptedProcess(script),
    });
    await expect(executor.resolve("../latest")).rejects.toThrow("Invalid npm version or tag");
    expect(script.requests).toEqual([]);
  });

  test.each(["1", "1.2", "1.x", "x", "X", "x.x", "v*", "v1.4", "^1.2.3", ">=1.0.0"])(
    "rejects semver range selector %s before invoking npm",
    async (selector: string): Promise<void> => {
      const script = createScript();
      const executor = createNpmPackageExecutor({
        platform: "linux",
        processExecutor: scriptedProcess(script),
      });
      await expect(executor.resolve(selector)).rejects.toThrow("Invalid npm version or tag");
      expect(script.requests).toEqual([]);
    },
  );

  test.each([
    ["not json", "invalid JSON"],
    [JSON.stringify(["bad-version"]), "invalid nano-mem version"],
    [JSON.stringify(["2.0.0-beta.1"]), "No matching stable"],
  ])(
    "rejects invalid registry response %#",
    async (response: string, message: string): Promise<void> => {
      const script = createScript();
      script.versionsResponse = response;
      const executor = createNpmPackageExecutor({
        platform: "linux",
        processExecutor: scriptedProcess(script),
      });
      await expect(executor.resolve(undefined)).rejects.toThrow(message);
    },
  );
});

const readViewTarget = (script: NpmScript): string | undefined =>
  script.requests.find((request: ProcessRequest): boolean => request.argumentsList.includes("view"))
    ?.argumentsList[1];

describe("npm global package mutation", (): void => {
  test("installs and verifies the exact global package version", async (): Promise<void> => {
    const script = createScript();
    const executor = createNpmPackageExecutor({
      platform: "linux",
      processExecutor: scriptedProcess(script),
    });
    const candidate = await executor.resolve("next");
    await executor.install(candidate);
    await executor.verifyInstalled(candidate.version);
    expect(script.installedVersion).toBe("2.0.0-beta.1");
    const install = script.requests.find(
      (request: ProcessRequest): boolean =>
        request.argumentsList.includes("--global") && request.argumentsList.includes("install"),
    );
    expect(install?.argumentsList).toContain(candidate.archivePath);
    expect(install?.argumentsList).toContain("--ignore-scripts");
    expect(install?.argumentsList).toContain("--offline");
    candidate.cleanup();
  });

  test("rejects a mismatched global package version", async (): Promise<void> => {
    const script = createScript();
    const executor = createNpmPackageExecutor({
      platform: "linux",
      processExecutor: scriptedProcess(script),
    });
    await expect(executor.verifyInstalled("2.0.0")).rejects.toThrow(
      "Expected global @kxh4892636/nano-mem@2.0.0, observed 1.0.0",
    );
  });

  test("uses npm-cli.js through node on Windows", async (): Promise<void> => {
    const script = createScript();
    const executor = createNpmPackageExecutor({
      execPath: "C:\\node\\node.exe",
      platform: "win32",
      processExecutor: scriptedProcess(script),
    });
    const candidate = await executor.resolve("next");
    await executor.install(candidate);
    const install = script.requests.find((request: ProcessRequest): boolean =>
      request.argumentsList.includes("--global"),
    );
    expect(install).toMatchObject({
      argumentsList: [
        "C:\\node\\node_modules\\npm\\bin\\npm-cli.js",
        "install",
        "--global",
        "--ignore-scripts",
        "--offline",
        candidate.archivePath,
      ],
      command: "C:\\node\\node.exe",
    });
    candidate.cleanup();
  });

  test("captures the installed package as a local rollback artifact", async (): Promise<void> => {
    const script = createScript();
    const executor = createNpmPackageExecutor({
      platform: "linux",
      processExecutor: scriptedProcess(script),
    });
    const retained = await executor.captureInstalled("1.0.0");
    expect(retained).toMatchObject({ version: "1.0.0" });
    expect(script.artifactVersions.get(retained.archivePath)).toBe("1.0.0");
    expect(
      script.requests.some(
        (request: ProcessRequest): boolean => request.argumentsList.at(-1) === "--version",
      ),
    ).toBe(true);
    retained.cleanup();
  });

  test("rejects a rollback archive whose packed identity changed", async (): Promise<void> => {
    const script = createScript();
    script.packedInstalledVersion = "9.9.9";
    const executor = createNpmPackageExecutor({
      platform: "linux",
      processExecutor: scriptedProcess(script),
    });
    await expect(executor.captureInstalled("1.0.0")).rejects.toThrow("identity does not match");
  });
});
