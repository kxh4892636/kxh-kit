import type { BuiltinCommand, BuiltinModuleFactory } from "../cli/types";

const discovered = import.meta.glob<{ default: BuiltinCommand }>("./*/index.ts", { eager: true });

export const builtinModules: readonly BuiltinModuleFactory[] = Object.values(discovered).map(
  (module: { default: BuiltinCommand }): BuiltinModuleFactory =>
    (): BuiltinCommand =>
      module.default,
);
