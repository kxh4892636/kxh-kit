import { access, readFile, rename, rm, writeFile } from "node:fs/promises";
import { channel } from "node:diagnostics_channel";
import path from "node:path";
import { isMap, isSeq, parse as parseYaml, parseDocument, type Document, type YAMLSeq } from "yaml";
import { z } from "zod";
import { errorMessage, hasErrorCode } from "./workspace-error";
import type { JsonValue } from "../../cli/types";

const workspaceDiagnostics = channel("nf.workspace");

export const WORKSPACE_CONFIG_FILE = "workspace.yaml";

export interface WorkspaceRepository {
  readonly name: string;
  readonly url: string;
  readonly path: string;
  readonly branch: string;
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

const repositoryUrl =
  /^(?:git@[a-zA-Z0-9.-]+:[^\s]+|ssh:\/\/[^\s]+|https?:\/\/[^\s]+|file:\/\/[^\s]+)$/u;

export const isWorkspaceRelativePath = (value: string): boolean => {
  if (value.length === 0) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (/^[a-zA-Z]:/u.test(value)) return false;
  if (value.split(/[\\/]/u).includes("..")) return false;
  return path.posix.normalize(value.replace(/\\/gu, "/")) !== ".";
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

const normalizeRepositoryPath = (value: string): string => {
  const normalized = path.posix.normalize(value.replace(/\\/gu, "/")).replace(/\/+$/u, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};

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

const exists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT", "ENOTDIR")) return false;
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
    throw error;
  }
};

const isMaterializedRepository = async (repositoryPath: string): Promise<boolean> =>
  exists(path.join(repositoryPath, ".git"));

export const findWorkspaceRoot = async (cwd: string): Promise<string> => {
  let current = path.resolve(cwd);
  for (;;) {
    if (await exists(path.join(current, WORKSPACE_CONFIG_FILE))) return current;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new WorkspaceConfigError(`No ${WORKSPACE_CONFIG_FILE} found from ${cwd} upwards`, {
        hint: `Run 'nf workspace config init' to create ${WORKSPACE_CONFIG_FILE} first`,
      });
    }
    current = parent;
  }
};

export const resolveRepositoryPath = (root: string, repository: RepositoryDraft): string =>
  path.resolve(root, repository.path);

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
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
    throw new WorkspaceConfigError(
      `Failed to read ${file}: ${error instanceof Error ? error.message : String(error)}`,
      {},
    );
  }
  const parsed = schema.safeParse(document ?? {});
  if (!parsed.success) throw invalidConfigError(file, parsed.error);
  return parsed.data;
};

export const loadWorkspaceFile = async (cwd: string): Promise<WorkspaceConfig> => {
  const root = await findWorkspaceRoot(cwd);
  const config = await parseConfigFile(path.join(root, WORKSPACE_CONFIG_FILE), workspaceFileSchema);
  return { root, repositories: config.repositories };
};

export type RepositoryDraft = {
  readonly name: string;
  readonly url: string;
  readonly path: string;
  readonly branch: string;
};

interface RepositoryWritePlan {
  readonly change: "added" | "updated";
  readonly index: number;
}

type RepositoryWriteMode = "add" | "update";

const planRepositoryWrite = (
  repositories: readonly RepositoryDraft[],
  draft: RepositoryDraft,
  mode: RepositoryWriteMode,
): RepositoryWritePlan => {
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
  if (mode === "add" && index !== -1) {
    throw new WorkspaceConfigError(
      `Repository already exists in ${WORKSPACE_CONFIG_FILE}: ${draft.name}`,
      { details: { name: draft.name } },
    );
  }
  if (mode === "update" && index === -1) {
    throw new WorkspaceConfigError(
      `Repository not found in ${WORKSPACE_CONFIG_FILE}: ${draft.name}`,
      { details: { name: draft.name } },
    );
  }
  return { change: mode === "add" ? "added" : "updated", index };
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
    workspaceDiagnostics.publish({ level: "error", message: errorMessage(error) });
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

export interface PreparedRepositoryWrite {
  readonly root: string;
  readonly config: string;
  readonly change: "added" | "updated";
  readonly repository: RepositoryDraft;
  commit(): Promise<void>;
}

export type RepositoryPatch = {
  readonly branch?: string | undefined;
  readonly path?: string | undefined;
  readonly url?: string | undefined;
};

interface WorkspaceDocumentState {
  readonly config: string;
  readonly document: Document;
  readonly repositories: readonly RepositoryDraft[];
  readonly root: string;
}

const loadWorkspaceDocument = async (cwd: string): Promise<WorkspaceDocumentState> => {
  const root = await findWorkspaceRoot(cwd);
  const config = path.join(root, WORKSPACE_CONFIG_FILE);
  return { root, config, ...(await readWorkspaceDocument(config)) };
};

const prepareRepositoryWrite = async (
  cwd: string,
  draft: RepositoryDraft,
  mode: RepositoryWriteMode,
  loaded?: WorkspaceDocumentState,
): Promise<PreparedRepositoryWrite> => {
  const validated = repositorySchema.safeParse(draft);
  if (!validated.success) {
    throw new WorkspaceConfigError(`Invalid repository '${draft.name}'`, {
      details: { issues: formatIssues(validated.error) },
    });
  }
  const state = loaded ?? (await loadWorkspaceDocument(cwd));
  const { config, document, repositories, root } = state;
  const plan = planRepositoryWrite(repositories, draft, mode);
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

export const prepareAddRepository = async (
  cwd: string,
  draft: RepositoryDraft,
): Promise<PreparedRepositoryWrite> => prepareRepositoryWrite(cwd, draft, "add");

export const prepareUpdateRepository = async (
  cwd: string,
  name: string,
  patch: RepositoryPatch,
): Promise<PreparedRepositoryWrite> => {
  const loaded = await loadWorkspaceDocument(cwd);
  const { repositories, root } = loaded;
  const repository = repositories.find(
    (entry: WorkspaceRepository): boolean => entry.name === name,
  );
  if (repository === undefined) {
    throw new WorkspaceConfigError(`Repository not found in ${WORKSPACE_CONFIG_FILE}: ${name}`, {
      details: { name },
    });
  }
  const repositoryPath = resolveRepositoryPath(root, repository);
  if (await isMaterializedRepository(repositoryPath)) {
    throw new WorkspaceConfigError(`Repository is materialized at ${repositoryPath}`, {
      details: { name, path: repositoryPath },
      hint: `Run 'nf workspace repository remove --name ${name} --yes' before updating its configuration`,
    });
  }
  const updated = {
    ...repository,
    ...(patch.url === undefined ? {} : { url: patch.url }),
    ...(patch.path === undefined ? {} : { path: patch.path }),
    ...(patch.branch === undefined ? {} : { branch: patch.branch }),
  };
  const updatedPath = resolveRepositoryPath(root, updated);
  if (updatedPath !== repositoryPath && (await isMaterializedRepository(updatedPath))) {
    throw new WorkspaceConfigError(`Repository is materialized at ${updatedPath}`, {
      details: { name, path: updatedPath },
      hint: "Choose an unused --path for the repository configuration",
    });
  }
  return prepareRepositoryWrite(cwd, updated, "update", loaded);
};

export interface PreparedRepositoryRemove {
  readonly root: string;
  readonly config: string;
  readonly removed: RepositoryDraft;
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
  const repositoryPath = resolveRepositoryPath(root, removed);
  if (await isMaterializedRepository(repositoryPath)) {
    throw new WorkspaceConfigError(`Repository is materialized at ${repositoryPath}`, {
      details: { name, path: repositoryPath },
      hint: `Run 'nf workspace repository remove --name ${name} --yes' before removing its configuration`,
    });
  }
  repositorySequence(document, config).delete(plan.index);
  assertValidDocument(document, config);
  return {
    root,
    config,
    removed,
    commit: async (): Promise<void> => {
      await writeConfigAtomically(config, document.toString());
    },
  };
};
