import path from "node:path";
import { command, group, option } from "../../cli/definition";
import { CliUsageError } from "../../cli/errors";
import type {
  BuiltinCommand,
  InvocationContext,
  JsonOutput,
  PreparedMutation,
  ValuesFromOptions,
} from "../../cli/types";
import type { ManagedSkill, SkillState } from "./skill-catalog";
import {
  prepareSkillChange,
  type SkillChangeKind,
  type SkillStoreDependencies,
} from "./skill-store";
import { inspectSkill } from "./skill-state";
import { prepareSelfUpdate, type PackageManagerPort } from "./self-updater";

export interface SelfCommandDependencies extends SkillStoreDependencies {
  readonly packageManager?: PackageManagerPort;
  readonly currentVersion?: string;
}

const listOptions = [option.string("target", "Managed skill root", {})] as const;
type ListOptions = ValuesFromOptions<typeof listOptions>;
const checkOptions = [
  option.string("name", "Managed skill name", { required: true }),
  option.string("target", "Managed skill root", {}),
] as const;
type CheckOptions = ValuesFromOptions<typeof checkOptions>;
const batchOptions = [
  option.string("name", "Managed skill name", { conflicts: ["all"] }),
  option.boolean("all", "Select every packaged skill", { conflicts: ["name"] }),
  option.string("target", "Managed skill root", {}),
  option.boolean("force", "Replace locally modified managed skills", {}),
] as const;
type BatchOptions = ValuesFromOptions<typeof batchOptions>;
const updateOptions = [
  option.string("name", "Managed skill name", { required: true }),
  option.string("target", "Managed skill root", {}),
  option.boolean("force", "Replace a locally modified managed skill", {}),
] as const;
type UpdateOptions = ValuesFromOptions<typeof updateOptions>;
const selfUpdateOptions = [
  option.string("version", "npm semver or tag", {}),
  option.string("target", "Managed skill root", {}),
] as const;
type SelfUpdateOptions = ValuesFromOptions<typeof selfUpdateOptions>;

const targetRoot = (target: string | undefined, context: InvocationContext): string =>
  path.resolve(target ?? path.join(context.cwd, ".agents", "skills"));

const selectBatch = (
  options: BatchOptions,
  catalog: readonly ManagedSkill[],
): readonly string[] => {
  const hasName = options.name !== undefined;
  const hasAll = options.all === true;
  if (hasName === hasAll) throw new CliUsageError("Provide exactly one of --name or --all");
  return hasAll ? catalog.map((skill: ManagedSkill): string => skill.name) : [options.name ?? ""];
};

interface PreparedChangeInput {
  readonly kind: SkillChangeKind;
  readonly names: readonly string[];
  readonly target: string | undefined;
  readonly force: boolean | undefined;
  readonly context: InvocationContext;
}

const prepareChange = async (
  input: PreparedChangeInput,
  catalog: readonly ManagedSkill[],
  dependencies: SkillStoreDependencies,
): Promise<PreparedMutation> => {
  const { context, force, kind, names, target } = input;
  return prepareSkillChange(
    catalog,
    { kind, names, targetRoot: targetRoot(target, context), force: force === true },
    dependencies,
  );
};

export const createSelfCommand = (
  catalog: readonly ManagedSkill[],
  dependencies: SelfCommandDependencies = {},
): BuiltinCommand =>
  group("self", "Manage Nano Flow itself", [
    group("skill", "Manage Nano Flow skills", [
      command("list", "List packaged skills", listOptions, {
        kind: "query",
        run: async (options: ListOptions, context: InvocationContext): Promise<JsonOutput> => {
          const root = targetRoot(options.target, context);
          const skills = await Promise.all(
            catalog.map((skill: ManagedSkill): Promise<SkillState> => inspectSkill(skill, root)),
          );
          return { skills };
        },
      }),
      command("check", "Check a managed skill", checkOptions, {
        kind: "query",
        run: async (options: CheckOptions, context: InvocationContext): Promise<JsonOutput> => {
          const skill = catalog.find(
            (candidate: ManagedSkill): boolean => candidate.name === options.name,
          );
          if (skill === undefined)
            throw new CliUsageError(`Unknown managed skill: ${options.name}`);
          return inspectSkill(skill, targetRoot(options.target, context));
        },
      }),
      command("install", "Install managed skills", batchOptions, {
        kind: "mutation",
        prepare: async (
          options: BatchOptions,
          context: InvocationContext,
        ): Promise<PreparedMutation> =>
          prepareChange(
            {
              kind: "install",
              names: selectBatch(options, catalog),
              target: options.target,
              force: options.force,
              context,
            },
            catalog,
            dependencies,
          ),
      }),
      command("update", "Update a managed skill", updateOptions, {
        kind: "mutation",
        prepare: async (
          options: UpdateOptions,
          context: InvocationContext,
        ): Promise<PreparedMutation> =>
          prepareChange(
            {
              kind: "update",
              names: [options.name],
              target: options.target,
              force: options.force,
              context,
            },
            catalog,
            dependencies,
          ),
      }),
      command("uninstall", "Uninstall managed skills", batchOptions, {
        kind: "mutation",
        prepare: async (
          options: BatchOptions,
          context: InvocationContext,
        ): Promise<PreparedMutation> =>
          prepareChange(
            {
              kind: "uninstall",
              names: selectBatch(options, catalog),
              target: options.target,
              force: options.force,
              context,
            },
            catalog,
            dependencies,
          ),
      }),
    ]),
    command("update", "Update Nano Flow from npm", selfUpdateOptions, {
      kind: "mutation",
      prepare: async (
        options: SelfUpdateOptions,
        context: InvocationContext,
      ): Promise<PreparedMutation> => {
        if (
          dependencies.packageManager === undefined ||
          dependencies.currentVersion === undefined
        ) {
          throw new Error("Nano Flow package manager is not configured");
        }
        return prepareSelfUpdate(
          dependencies.currentVersion,
          catalog,
          dependencies.packageManager,
          {
            selector: options.version ?? "latest",
            targetRoot: targetRoot(options.target, context),
          },
          dependencies,
        );
      },
    }),
  ]);
