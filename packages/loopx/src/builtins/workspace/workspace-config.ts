import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { JsonValue } from "../../cli/types";

export const WORKSPACE_CONFIG_FILE = "workspace.yaml";
export const WORKSPACE_LOCAL_FILE = "workspace.local.yaml";

export interface WorkspaceRepository {
  readonly name: string;
  readonly url: string;
  readonly path: string;
  readonly branch: string;
  readonly clonePath?: string | undefined;
}

export interface WorkspaceConfig {
  readonly root: string;
  readonly repositories: readonly WorkspaceRepository[];
}

export class WorkspaceConfigError extends Error {
  readonly hint: string | undefined;
  readonly details: Readonly<Record<string, JsonValue>> | undefined;

  constructor(
    message: string,
    options: { readonly details?: Readonly<Record<string, JsonValue>>; readonly hint?: string },
  ) {
    super(message);
    this.name = "WorkspaceConfigError";
    this.hint = options.hint;
    this.details = options.details;
  }
}

const repositoryUrl = /^(?:git@[a-zA-Z0-9.-]+:[^\s]+|ssh:\/\/[^\s]+|https?:\/\/[^\s]+)$/u;

const isRelativeRepositoryPath = (value: string): boolean => {
  if (value.length === 0) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (/^[a-zA-Z]:[\\/]/u.test(value)) return false;
  return !value.split(/[\\/]/u).includes("..");
};

const repositorySchema = z.object({
  name: z.string().min(1),
  url: z
    .string()
    .regex(repositoryUrl, "url must be an ssh (git@host:path or ssh://) or http(s) url"),
  path: z
    .string()
    .refine(
      isRelativeRepositoryPath,
      "path must be relative to the workspace root and must not contain '..'",
    ),
  branch: z.string().min(1),
});

const normalizeRepositoryPath = (value: string): string =>
  value.replace(/\\/gu, "/").replace(/\/+$/u, "");

const workspaceFileSchema = z
  .object({ repositories: z.array(repositorySchema).default([]) })
  .superRefine(
    (
      config: { repositories: { name: string; path: string }[] },
      context: z.RefinementCtx,
    ): void => {
      const names = new Set<string>();
      const paths = new Set<string>();
      config.repositories.forEach((repository, index): void => {
        if (names.has(repository.name)) {
          context.addIssue({
            code: "custom",
            message: `duplicate repository name: ${repository.name}`,
            path: ["repositories", index, "name"],
          });
          return;
        }
        names.add(repository.name);
        const normalizedPath = normalizeRepositoryPath(repository.path);
        if (paths.has(normalizedPath)) {
          context.addIssue({
            code: "custom",
            message: `duplicate repository path: ${repository.path}`,
            path: ["repositories", index, "path"],
          });
          return;
        }
        paths.add(normalizedPath);
      });
    },
  );

const isAbsoluteClonePath = (value: string): boolean =>
  value.startsWith("/") || value.startsWith("\\") || /^[a-zA-Z]:[\\/]/u.test(value);

const localFileSchema = z.object({
  repositories: z
    .array(
      z.object({
        name: z.string().min(1),
        clone_path: z
          .string()
          .min(1)
          .refine(isAbsoluteClonePath, "clone_path must be an absolute path"),
      }),
    )
    .default([]),
});

const exists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

export const findWorkspaceRoot = async (cwd: string): Promise<string> => {
  let current = path.resolve(cwd);
  for (;;) {
    if (await exists(path.join(current, WORKSPACE_CONFIG_FILE))) return current;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new WorkspaceConfigError(`No ${WORKSPACE_CONFIG_FILE} found from ${cwd} upwards`, {
        hint: `Run 'loopx workspace init' to create ${WORKSPACE_CONFIG_FILE} first`,
      });
    }
    current = parent;
  }
};

const parseConfigFile = async <Schema extends z.ZodType>(
  file: string,
  schema: Schema,
): Promise<z.output<Schema>> => {
  let document: unknown;
  try {
    document = parseYaml(await readFile(file, "utf8"));
  } catch (error) {
    throw new WorkspaceConfigError(
      `Failed to read ${file}: ${error instanceof Error ? error.message : String(error)}`,
      {},
    );
  }
  const parsed = schema.safeParse(document ?? {});
  if (!parsed.success) {
    throw new WorkspaceConfigError(`Invalid ${file}`, {
      details: {
        issues: parsed.error.issues.map(
          (issue: z.core.$ZodIssue): JsonValue =>
            `${issue.path.join(".") || "(root)"}: ${issue.message}`,
        ),
      },
    });
  }
  return parsed.data;
};

export const loadWorkspaceConfig = async (cwd: string): Promise<WorkspaceConfig> => {
  const root = await findWorkspaceRoot(cwd);
  const config = await parseConfigFile(path.join(root, WORKSPACE_CONFIG_FILE), workspaceFileSchema);
  const localFile = path.join(root, WORKSPACE_LOCAL_FILE);
  const local = (await exists(localFile))
    ? await parseConfigFile(localFile, localFileSchema)
    : { repositories: [] };
  const clonePaths = new Map(
    local.repositories.map((record): readonly [string, string] => [record.name, record.clone_path]),
  );
  return {
    root,
    repositories: config.repositories.map((repository): WorkspaceRepository => {
      const clonePath = clonePaths.get(repository.name);
      return { ...repository, ...(clonePath === undefined ? {} : { clonePath }) };
    }),
  };
};
