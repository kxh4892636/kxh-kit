import { defineConfig, type Plugin } from "vitest/config";

const stripScriptShebang = (): Plugin => ({
  name: "nf-strip-script-shebang",
  enforce: "pre",
  transform: (source: string, id: string): null | string => {
    if (!id.includes("/skills/") || !id.endsWith(".mjs") || !source.startsWith("#!")) return null;
    return source.replace(/^#![^\n]*\n/u, "");
  },
});

export default defineConfig({
  plugins: [stripScriptShebang()],
  test: {
    include: ["src/**/*.spec.ts", "skills/**/scripts/*.test.mjs", "test/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "skills/**/scripts/*.mjs"],
      exclude: [
        "src/**/*.spec.ts",
        "src/**/*.d.ts",
        "src/**/testing/**",
        "src/**/generated-skill-manifest.ts",
        "skills/**/scripts/*.test.mjs",
      ],
      excludeAfterRemap: true,
      reporter: ["text", "json", "html"],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
