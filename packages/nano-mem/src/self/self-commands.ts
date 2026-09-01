import type { Command } from "commander";
import type { CommandContext, CommandRegistrar } from "../cli.js";
import {
  createManagedSkillService,
  type ManagedSkillFileSystem,
  type SkillManifest,
  type SkillMutation,
} from "./managed-skill.js";

interface SelfCommandDependencies {
  createId?: () => string;
  fileSystem?: ManagedSkillFileSystem;
  manifest: SkillManifest;
  sourceDirectory: string;
}

interface TargetOptions {
  target?: string;
}

interface MutationOptions extends TargetOptions {
  dryRun?: boolean;
  force?: boolean;
}

const addTargetOption = (command: Command): Command =>
  command.option("--target <root>", "Skills root directory");

const addMutationOptions = (command: Command): Command =>
  addTargetOption(command)
    .option("--dry-run", "Return the planned change without writing")
    .option("--force", "Overwrite or remove a locally modified skill");

const registerMutation = (
  skill: Command,
  context: CommandContext,
  service: ReturnType<typeof createManagedSkillService>,
  action: SkillMutation,
): void => {
  const command = addMutationOptions(
    skill.command(action).description(`${action} the managed nano-mem skill`),
  );
  command.action((): void => {
    const options = command.opts<MutationOptions>();
    context.respond(
      service.mutate(action, {
        dryRun: options.dryRun === true,
        force: options.force === true,
        ...(options.target === undefined ? {} : { target: options.target }),
      }),
    );
  });
};

export const createSelfCommandRegistrar =
  (dependencies: SelfCommandDependencies): CommandRegistrar =>
  (program: Command, context: CommandContext): void => {
    const service = createManagedSkillService({
      cwd: context.runtime.paths.cwd,
      manifest: dependencies.manifest,
      sourceDirectory: dependencies.sourceDirectory,
      ...(dependencies.createId === undefined ? {} : { createId: dependencies.createId }),
      ...(dependencies.fileSystem === undefined ? {} : { fileSystem: dependencies.fileSystem }),
    });
    const self = program.command("self").description("Manage the nano-mem installation");
    const skill = self.command("skill").description("Manage the packaged nano-mem skill");
    const status = addTargetOption(
      skill.command("status").description("Inspect managed skill status"),
    );
    status.action((): void => {
      const options = status.opts<TargetOptions>();
      context.respond(service.status(options.target));
    });
    registerMutation(skill, context, service, "install");
    registerMutation(skill, context, service, "update");
    registerMutation(skill, context, service, "uninstall");
  };
