<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Use `git status --short` to identify uncommitted files (staged, unstaged, and untracked), then run `vp check --fix <changed-paths>` / `vp check <changed-paths>` and the smallest relevant `vp test <changed-test-paths-or-pattern>` to format, lint, type check and test only those changes. Do not run whole-repo `vp check` / `vp test` unless explicitly requested or required by a shared behavior change that cannot be validated by path-scoped commands.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.

<!--VITE PLUS END-->
