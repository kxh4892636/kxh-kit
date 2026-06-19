# kxh-awesome Agent Instructions

This repository contains both engineering projects and non-code content work.

## Git

- git message use chinese;

## Task Scope

- For code, dependency, Node.js, workspace, build, test, lint, format, RPC/proto, generated-code, git-hook, or package-script tasks, use the Vite+ guidance below and inspect only the relevant project configuration.
- For notes, stock or fund analysis, weekly reports, research writeups, document polishing, and other non-code content tasks, do not inspect `package.json`, `vite.config.ts`, `tsconfig.json`, or Node/Vite+ configuration just because the files live in this repository.
- Run Vite+ checks for non-code content only when the task changes a built site/app, navigation/config, executable examples, generated docs, package metadata, or when the user explicitly asks for engineering validation.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
