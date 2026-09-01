import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface Clock {
  now: () => Date;
}

export interface DatabaseFactory {
  open: (databasePath: string) => DatabaseSync;
}

export interface PathRuntime {
  cwd: string;
  home: string;
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

export interface RuntimeDependencies {
  clock: Clock;
  databaseFactory: DatabaseFactory;
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
        (error: Error | null, stdout: string, stderr: string): void => {
          if (error) {
            reject(error);
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
  paths: {
    cwd: process.cwd(),
    home: homedir(),
    resolve: (...segments: string[]): string => resolve(...segments),
  },
  processExecutor: { execute: executeProcess },
});
