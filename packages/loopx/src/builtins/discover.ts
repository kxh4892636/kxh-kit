import type { BuiltinCommand, BuiltinModuleFactory } from "../cli/types";

// Vite 要求 glob 参数保持编译期字面量，Stryker 插桩会破坏该宏。
// Stryker disable next-line all
const discovered = import.meta.glob<{ default: BuiltinCommand }>("./*/index.ts", { eager: true });

export const builtinModules: readonly BuiltinModuleFactory[] = Object.values(discovered).map(
  (module: { default: BuiltinCommand }): BuiltinModuleFactory =>
    (): BuiltinCommand =>
      module.default,
);
