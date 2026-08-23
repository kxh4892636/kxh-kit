import { access, readFile, rename, rm, writeFile } from "node:fs/promises";
import { channel } from "node:diagnostics_channel";
import path from "node:path";
import { isMap, isSeq, parse as parseYaml, parseDocument, type Document, type YAMLSeq } from "yaml";
import { z } from "zod";
import type { JsonValue } from "../../cli/types";

const workspaceDiagnostics = channel("loopx.workspace");

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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

export interface WorkspaceLocalRepository {
  readonly name: string;
  readonly clonePath: string;
}

export interface WorkspaceConfigurationView extends WorkspaceConfig {
  readonly localRepositories: readonly WorkspaceLocalRepository[];
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

const repositoryUrl =
  /^(?:git@[a-zA-Z0-9.-]+:[^\s]+|ssh:\/\/[^\s]+|https?:\/\/[^\s]+|file:\/\/[^\s]+)$/u;

export const isWorkspaceRelativePath = (value: string): boolean => {
  if (value.length === 0) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (/^[a-zA-Z]:/u.test(value)) return false;
  return !value.split(/[\\/]/u).includes("..");
};

const repositorySchema = z.object({
  name: z.string().min(1),
  url: z
    .string()
    .regex(repositoryUrl, "url must be an ssh (git@host:path or ssh://), http(s) or file url"),
  path: z
    .string()
    .refine(
      isWorkspaceRelativePath,
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
      config.repositories.forEach(
        (repository: { name: string; path: string }, index: number): void => {
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
        },
      );
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
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
    throw error;
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

const formatIssues = (error: z.ZodError): JsonValue =>
  error.issues.map(
    (issue: z.core.$ZodIssue): JsonValue => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );

const invalidConfigError = (file: string, error: z.ZodError): WorkspaceConfigError =>
  new WorkspaceConfigError(`Invalid ${file}`, { details: { issues: formatIssues(error) } });

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
  if (!parsed.success) throw invalidConfigError(file, parsed.error);
  return parsed.data;
};

export const loadWorkspaceConfigurationView = async (
  cwd: string,
): Promise<WorkspaceConfigurationView> => {
  const root = await findWorkspaceRoot(cwd);
  const config = await parseConfigFile(path.join(root, WORKSPACE_CONFIG_FILE), workspaceFileSchema);
  const localFile = path.join(root, WORKSPACE_LOCAL_FILE);
  const local = (await exists(localFile))
    ? await parseConfigFile(localFile, localFileSchema)
    : { repositories: [] };
  const clonePaths = new Map(
    local.repositories.map(
      (record: { clone_path: string; name: string }): readonly [string, string] => [
        record.name,
        record.clone_path,
      ],
    ),
  );
  return {
    root,
    repositories: config.repositories.map((repository: RepositoryDraft): WorkspaceRepository => {
      const clonePath = clonePaths.get(repository.name);
      return { ...repository, ...(clonePath === undefined ? {} : { clonePath }) };
    }),
    localRepositories: local.repositories.map(
      (record: {
        readonly clone_path: string;
        readonly name: string;
      }): WorkspaceLocalRepository => ({
        name: record.name,
        clonePath: record.clone_path,
      }),
    ),
  };
};

export const loadWorkspaceConfig = async (cwd: string): Promise<WorkspaceConfig> => {
  const config = await loadWorkspaceConfigurationView(cwd);
  return { root: config.root, repositories: config.repositories };
};

export type RepositoryDraft = {
  readonly name: string;
  readonly url: string;
  readonly path: string;
  readonly branch: string;
};

export interface UpsertPlan {
  readonly change: "added" | "updated";
  readonly index: number;
}

export const planUpsert = (
  repositories: readonly RepositoryDraft[],
  draft: RepositoryDraft,
): UpsertPlan => {
  const conflict = repositories.find(
    (repository: RepositoryDraft): boolean =>
      repository.name !== draft.name &&
      normalizeRepositoryPath(repository.path) === normalizeRepositoryPath(draft.path),
  );
  if (conflict !== undefined) {
    throw new WorkspaceConfigError(
      `Repository path '${draft.path}' is already used by '${conflict.name}'`,
      { details: { name: draft.name, path: draft.path, conflict: conflict.name } },
    );
  }
  const index = repositories.findIndex(
    (repository: RepositoryDraft): boolean => repository.name === draft.name,
  );
  return index === -1 ? { change: "added", index } : { change: "updated", index };
};

export const planRemove = (
  repositories: readonly RepositoryDraft[],
  name: string,
): { readonly index: number } => {
  const index = repositories.findIndex(
    (repository: RepositoryDraft): boolean => repository.name === name,
  );
  if (index === -1) {
    throw new WorkspaceConfigError(`Repository not found in ${WORKSPACE_CONFIG_FILE}: ${name}`, {
      details: { name },
    });
  }
  return { index };
};

const readWorkspaceDocument = async (
  config: string,
): Promise<{ readonly document: Document; readonly repositories: readonly RepositoryDraft[] }> => {
  let text: string;
  try {
    text = await readFile(config, "utf8");
  } catch (error) {
    throw new WorkspaceConfigError(
      `Failed to read ${config}: ${error instanceof Error ? error.message : String(error)}`,
      {},
    );
  }
  const document = parseDocument(text);
  if (document.errors.length > 0) {
    throw new WorkspaceConfigError(`Failed to read ${config}: ${document.errors[0]?.message}`, {});
  }
  const parsed = workspaceFileSchema.safeParse(document.toJS() ?? {});
  if (!parsed.success) throw invalidConfigError(config, parsed.error);
  return { document, repositories: parsed.data.repositories };
};

const assertValidDocument = (document: Document, config: string): void => {
  const parsed = workspaceFileSchema.safeParse(document.toJS() ?? {});
  if (!parsed.success) throw invalidConfigError(config, parsed.error);
};

const repositorySequence = (document: Document, file: string): YAMLSeq => {
  const existing = document.get("repositories", true);
  if (isSeq(existing)) return existing;
  const created = document.createNode([]);
  if (!isSeq(created)) {
    throw new WorkspaceConfigError(`Failed to edit ${file}`, {});
  }
  document.set("repositories", created);
  return created;
};

const writeConfigAtomically = async (config: string, content: string): Promise<void> => {
  const temporary = path.join(path.dirname(config), `.${path.basename(config)}.${process.pid}.tmp`);
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, config);
  } catch (error) {
    await rm(temporary, { force: true }).catch((): undefined => undefined);
    throw new WorkspaceConfigError(
      `Failed to write ${config}: ${error instanceof Error ? error.message : String(error)}`,
      {},
    );
  }
};

export interface PreparedRepositoryUpsert {
  readonly root: string;
  readonly config: string;
  readonly change: "added" | "updated";
  readonly repository: RepositoryDraft;
  commit(): Promise<void>;
}

export const prepareUpsertRepository = async (
  cwd: string,
  draft: RepositoryDraft,
): Promise<PreparedRepositoryUpsert> => {
  const validated = repositorySchema.safeParse(draft);
  if (!validated.success) {
    throw new WorkspaceConfigError(`Invalid repository '${draft.name}'`, {
      details: { issues: formatIssues(validated.error) },
    });
  }
  const root = await findWorkspaceRoot(cwd);
  const config = path.join(root, WORKSPACE_CONFIG_FILE);
  const { document, repositories } = await readWorkspaceDocument(config);
  const plan = planUpsert(repositories, draft);
  const sequence = repositorySequence(document, config);
  if (plan.change === "added") {
    sequence.flow = false;
    sequence.add(
      document.createNode({
        name: draft.name,
        url: draft.url,
        path: draft.path,
        branch: draft.branch,
      }),
    );
  } else {
    const item = sequence.items[plan.index];
    if (item === undefined || !isMap(item)) {
      throw new WorkspaceConfigError(`Failed to edit ${config}: entry '${draft.name}'`, {});
    }
    item.set("url", draft.url);
    item.set("path", draft.path);
    item.set("branch", draft.branch);
  }
  assertValidDocument(document, config);
  return {
    root,
    config,
    change: plan.change,
    repository: draft,
    commit: async (): Promise<void> => {
      await writeConfigAtomically(config, document.toString());
    },
  };
};

export interface PreparedRepositoryRemove {
  readonly root: string;
  readonly config: string;
  readonly removed: RepositoryDraft;
  readonly residualClonePath?: string | undefined;
  commit(): Promise<void>;
}

export const prepareRemoveRepository = async (
  cwd: string,
  name: string,
): Promise<PreparedRepositoryRemove> => {
  const root = await findWorkspaceRoot(cwd);
  const config = path.join(root, WORKSPACE_CONFIG_FILE);
  const { document, repositories } = await readWorkspaceDocument(config);
  const plan = planRemove(repositories, name);
  const removed = repositories[plan.index];
  if (removed === undefined) {
    throw new WorkspaceConfigError(`Failed to edit ${config}: entry '${name}'`, {});
  }
  repositorySequence(document, config).delete(plan.index);
  assertValidDocument(document, config);
  const localFile = path.join(root, WORKSPACE_LOCAL_FILE);
  const local = (await exists(localFile))
    ? await parseConfigFile(localFile, localFileSchema)
    : { repositories: [] };
  const residual = local.repositories.find(
    (record: { name: string; clone_path: string }): boolean => record.name === name,
  );
  return {
    root,
    config,
    removed,
    ...(residual === undefined ? {} : { residualClonePath: residual.clone_path }),
    commit: async (): Promise<void> => {
      await writeConfigAtomically(config, document.toString());
    },
  };
};

export const recordClonePath = async (
  root: string,
  name: string,
  clonePath: string,
): Promise<void> => {
  const localFile = path.join(root, WORKSPACE_LOCAL_FILE);
  let document: Document;
  if (await exists(localFile)) {
    let text: string;
    try {
      text = await readFile(localFile, "utf8");
    } catch (error) {
      throw new WorkspaceConfigError(
        `Failed to read ${localFile}: ${error instanceof Error ? error.message : String(error)}`,
        {},
      );
    }
    document = parseDocument(text);
    if (document.errors.length > 0) {
      throw new WorkspaceConfigError(
        `Failed to read ${localFile}: ${document.errors[0]?.message}`,
        {},
      );
    }
  } else {
    document = parseDocument("");
  }
  const sequence = repositorySequence(document, localFile);
  const item = sequence.items.find(
    (entry: unknown): boolean => isMap(entry) && entry.get("name") === name,
  );
  if (item === undefined) {
    sequence.flow = false;
    sequence.add(document.createNode({ name, clone_path: clonePath }));
  } else {
    if (!isMap(item)) {
      throw new WorkspaceConfigError(`Failed to edit ${localFile}: entry '${name}'`, {});
    }
    item.set("clone_path", clonePath);
  }
  const parsed = localFileSchema.safeParse(document.toJS() ?? {});
  if (!parsed.success) throw invalidConfigError(localFile, parsed.error);
  await writeConfigAtomically(localFile, document.toString());
};
