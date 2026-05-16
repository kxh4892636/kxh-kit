# kxh-awesome Agent Instructions

This repository contains both engineering projects and non-code content work.

## Task Scope

- For code, dependency, Node.js, workspace, build, test, lint, format, RPC/proto, generated-code, git-hook, or package-script tasks, use the Vite+ guidance below and inspect only the relevant project configuration.
- For notes, stock or fund analysis, weekly reports, research writeups, document polishing, and other non-code content tasks, do not inspect `package.json`, `vite.config.ts`, `tsconfig.json`, or Node/Vite+ configuration just because the files live in this repository.
- Run Vite+ checks for non-code content only when the task changes a built site/app, navigation/config, executable examples, generated docs, package metadata, or when the user explicitly asks for engineering validation.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] For engineering tasks, run `vp install` after pulling remote changes and before getting started.
- [ ] For code or engineering changes, use `git status --short` to identify changed files, then run path-scoped `vp check --fix <changed-paths>` / `vp check <changed-paths>` and the smallest relevant `vp test <changed-test-paths-or-pattern>`. Do not run whole-repo `vp check` / `vp test` unless explicitly requested or required by a shared behavior change.
- [ ] For engineering tasks, check whether `vite.config.ts` tasks or `package.json` scripts are necessary for validation, then run them via `vp run <script>`.

<!--VITE PLUS END-->
