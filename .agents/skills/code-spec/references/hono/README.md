---
name: hono
description: Hono/honojs 专项参考。由 code-spec 按需读取，用于构建、调试、评审、迁移或解释 Hono 应用、API、路由、中间件、helper、RPC client、校验、JSX、测试、adapter 和部署，并优先查阅本地官方 docs 镜像。
---

# Hono

Use this reference to answer or implement Hono work from the official Hono website docs. The local reference is a snapshot of the upstream docs, so prefer it over memory for API details, import paths, runtime entry points, middleware options, and examples.

## Source

- Upstream repository: `https://github.com/honojs/website`
- Upstream source directory: `docs/`
- Snapshot commit: `3593c79adbe4caf5c519ee8f15f0e31f1a2a63c5`
- Full source docs: `references/source-docs/`
- Compact source map: `references/source-map.md`

The full upstream docs are mirrored under `references/source-docs/` to preserve completeness. Do not treat this `README.md` as a replacement for the detailed reference files.

## What Counts As Done

For Hono coding or architecture tasks, finish only after you have:

1. Identified the target runtime, adapter, package manager, and TypeScript constraints from the user's project or prompt.
2. Loaded the relevant local docs from `references/source-docs/` before giving version-sensitive API guidance.
3. Produced code that matches the selected runtime entry point and existing project conventions.
4. Included the smallest useful verification step, such as a route test with `app.request()`, the project's test command, or the runtime dev command.
5. Flagged stale-doc risk if the user asks for the latest behavior and the local snapshot may not be enough.

## Workflow

1. Classify the request before reading references:
   - New app, deployment, or adapter setup.
   - Core API: `Hono`, routing, `Context`, `HonoRequest`, exceptions, presets.
   - Middleware: built-in, third-party, custom middleware, execution order.
   - Helpers: cookies, JWT, HTML, CSS, WebSocket, SSG, streaming, testing, adapters.
   - Type safety: validation, Hono RPC, `hc`, shared route types, inferred responses.
   - Rendering: JSX, JSX DOM/client components, JSX renderer middleware.
2. Read `references/source-map.md` to locate source files, then open only the relevant docs.
3. Adapt examples to the user's runtime. Hono is Web Standards based, but entry points differ across Workers, Pages, Bun, Deno, Node.js, Lambda, Next.js, and other platforms.
4. Prefer direct Hono primitives over invented abstractions: `new Hono()`, `app.get/post/use/on/all/route/basePath/mount`, `c.req`, `c.json()`, `c.text()`, `c.html()`, `c.set()`/`c.get()`, and middleware that calls `await next()`.
5. For existing repositories, inspect local files first and preserve their package manager, runtime adapter, validation library, and test framework.
6. When docs and local project code disagree, separate facts from assumptions. Explain what the docs say, what the project currently does, and the smallest change needed.

## Reference Map

Start with these files:

| Need | Read |
| --- | --- |
| Overview and core concepts | `references/source-docs/index.md`, `references/source-docs/concepts/*.md` |
| New project or platform deployment | `references/source-docs/getting-started/*.md` |
| App, routing, context, request, exceptions, presets | `references/source-docs/api/*.md` |
| Best practices, middleware concepts, validation, RPC, JSX, testing | `references/source-docs/guides/*.md` |
| Helpers and runtime-specific helper APIs | `references/source-docs/helpers/*.md` |
| Built-in middleware options and examples | `references/source-docs/middleware/builtin/*.md` |
| Third-party middleware ecosystem | `references/source-docs/middleware/third-party.md` |
| Full file inventory | `references/source-map.md` |

## Implementation Guidance

- Treat Hono as a Web Standards framework. Prefer `Request`, `Response`, Fetch API, and runtime-provided bindings over Node-only assumptions unless the chosen adapter is Node.js.
- Keep handlers small and composable. Use `app.route()` or `basePath()` for grouping instead of forcing controller layers unless the existing codebase already uses them.
- Middleware order is behavior. Read the middleware docs when changing auth, CORS, body parsing, request IDs, response headers, timing, or error behavior.
- Use typed `Bindings` and `Variables` with `new Hono<{ Bindings: ...; Variables: ... }>()` when environment variables or `c.set()`/`c.get()` values matter.
- For validation and RPC, read both `guides/validation.md` and `guides/rpc.md`. Preserve the server route type export pattern and use `hc` only after confirming the route structure.
- For tests, prefer `app.request()` for direct route tests unless the platform guide requires runtime-specific test utilities.
- Do not invent import paths or middleware options. Hono exposes many runtime-specific modules, helpers, and presets; verify them in the local docs first.
- Mention deprecations and caveats when the docs call them out, such as `app.fire()` being deprecated in favor of `fire()` from `hono/service-worker`.

## Updating This Skill

Use this process when refreshing from upstream:

1. Clone the website repository into a temporary directory:

   ```powershell
   git clone --depth 1 --filter=blob:none --sparse https://github.com/honojs/website <tmp-dir>
   ```

2. In the temporary repository, check out only docs:

   ```powershell
   git sparse-checkout set docs
   git rev-parse HEAD
   ```

3. Replace `references/source-docs/` with the refreshed `docs/` contents, preserving the same relative paths.
4. Regenerate `references/source-map.md` from the refreshed file list and headings.
5. Update the snapshot commit in this file.
6. Review the diff to ensure no source document, paragraph, code sample, option, or warning was dropped.

## Validation Prompts

Representative prompts are saved in `evals/evals.json`. Use them for manual review or a future `skill-creator` evaluation run.
