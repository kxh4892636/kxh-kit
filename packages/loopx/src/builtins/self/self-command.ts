import path from "node:path";
import { command, group, option } from "../../cli/definition";
import { CliUsageError } from "../../cli/errors";
import type {
  BuiltinCommand,
  InvocationContext,
  JsonOutput,
  ValuesFromOptions,
} from "../../cli/types";
import type { ManagedSkill, SkillState } from "./skill-catalog";
import { inspectSkill } from "./skill-state";

const listOptions = [option.string("target", "Managed skill root", {})] as const;
type ListOptions = ValuesFromOptions<typeof listOptions>;
const checkOptions = [
  option.string("name", "Managed skill name", { required: true }),
  option.string("target", "Managed skill root", {}),
] as const;
type CheckOptions = ValuesFromOptions<typeof checkOptions>;

const targetRoot = (target: string | undefined, context: InvocationContext): string =>
  path.resolve(target ?? path.join(context.cwd, ".agents", "skills"));

export const createSelfCommand = (catalog: readonly ManagedSkill[]): BuiltinCommand =>
  group("self", "Manage LoopX itself", [
    group("skill", "Manage LoopX skills", [
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
    ]),
  ]);
