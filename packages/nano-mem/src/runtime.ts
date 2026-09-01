import { execFile, type ExecFileException } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface Clock {
  now: () => Date;
}

export interface DatabaseFactory {
  open: (databasePath: string) => DatabaseSync;
}

export interface PathRuntime {
  basename: (path: string) => string;
  cwd: string;
  ensureDirectory: (path: string) => void;
  home: string;
  join: (...segments: string[]) => string;
  platform: NodeJS.Platform;
  resolve: (...segments: string[]) => string;
}

export interface ProcessRequest {
  argumentsList: readonly string[];
  command: string;
  cwd?: string;
}

export interface ProcessResult {
  stderr: string;
  stdout: string;
}

export interface ProcessExecutor {
  execute: (request: ProcessRequest) => Promise<ProcessResult>;
}

export class ProcessExecutionError extends Error {
  readonly exitCode: number | string | null;
  readonly stderr: string;
  readonly stdout: string;

  constructor(error: ExecFileException, stdout: string, stderr: string) {
    super(error.message, { cause: error });
    this.name = "ProcessExecutionError";
    this.exitCode = error.code ?? null;
    this.stderr = stderr;
    this.stdout = stdout;
  }
}

export interface RuntimeDependencies {
  clock: Clock;
  databaseFactory: DatabaseFactory;
  environment: Readonly<Record<string, string | undefined>>;
  paths: PathRuntime;
  processExecutor: ProcessExecutor;
}

const executeProcess = async (request: ProcessRequest): Promise<ProcessResult> =>
  new Promise<ProcessResult>(
    (
      resolveResult: (value: ProcessResult | PromiseLike<ProcessResult>) => void,
      reject: (reason?: unknown) => void,
    ): void => {
      execFile(
        request.command,
        [...request.argumentsList],
        { cwd: request.cwd, encoding: "utf8", windowsHide: true },
        (error: ExecFileException | null, stdout: string, stderr: string): void => {
          if (error) {
            reject(new ProcessExecutionError(error, stdout, stderr));
            return;
          }
          resolveResult({ stderr, stdout });
        },
      );
    },
  );

export const nodeRuntime = (): RuntimeDependencies => ({
  clock: { now: (): Date => new Date() },
  databaseFactory: {
    open: (databasePath: string): DatabaseSync => new DatabaseSync(databasePath),
  },
  environment: process.env,
  paths: {
    basename: (path: string): string => basename(path),
    cwd: process.cwd(),
    ensureDirectory: (path: string): void => {
      mkdirSync(path, { recursive: true });
    },
    home: homedir(),
    join: (...segments: string[]): string => join(...segments),
    platform: process.platform,
    resolve: (...segments: string[]): string => resolve(...segments),
  },
  processExecutor: { execute: executeProcess },
});
