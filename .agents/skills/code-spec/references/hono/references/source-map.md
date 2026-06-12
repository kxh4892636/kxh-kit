# Hono Docs Source Map

Source: `https://github.com/honojs/website/tree/main/docs`  
Snapshot commit: `3593c79adbe4caf5c519ee8f15f0e31f1a2a63c5`  
Local mirror: `references/source-docs/`

The source docs are copied verbatim into `source-docs/`. Use this map to choose the smallest relevant subset before answering or editing Hono code.

## Overview

- `source-docs/index.md` - Hono overview, quick start, features, use cases, routers, Web Standards, middleware/helpers, DX.

## Concepts

- `source-docs/concepts/benchmarks.md` - Router and runtime benchmark notes.
- `source-docs/concepts/developer-experience.md` - Developer experience and TypeScript positioning.
- `source-docs/concepts/middleware.md` - Middleware concept overview.
- `source-docs/concepts/motivation.md` - Hono philosophy and motivation.
- `source-docs/concepts/routers.md` - RegExpRouter, TrieRouter, SmartRouter, LinearRouter, PatternRouter.
- `source-docs/concepts/stacks.md` - Hono stacks, RPC, API writing, Zod validation, shared types, client, React.
- `source-docs/concepts/web-standard.md` - Web Standards foundation.

## Getting Started And Runtime Guides

- `source-docs/getting-started/ali-function-compute.md` - Alibaba Cloud Function Compute setup and deploy.
- `source-docs/getting-started/aws-lambda.md` - AWS Lambda setup, deploy, binary data, Lambda object, request context, response streaming.
- `source-docs/getting-started/azure-functions.md` - Azure Functions CLI, setup, hello world, run, deploy.
- `source-docs/getting-started/basic.md` - Starter templates, hello world, JSON, request/response, HTML, raw Response, middleware, adapter.
- `source-docs/getting-started/bun.md` - Bun setup, hello world, port, static files, testing.
- `source-docs/getting-started/cloudflare-pages.md` - Cloudflare Pages setup, deploy, bindings, client-side, Pages Middleware.
- `source-docs/getting-started/cloudflare-workers.md` - Cloudflare Workers setup, deploy, event handlers, static files, types, testing, bindings, GitHub Actions, local env.
- `source-docs/getting-started/deno.md` - Deno setup, static files, deploy, testing, npm and JSR.
- `source-docs/getting-started/fastly.md` - Fastly Compute setup, run, deploy, bindings.
- `source-docs/getting-started/google-cloud-run.md` - Google Cloud Run setup, deploy, changing runtimes.
- `source-docs/getting-started/lambda-edge.md` - Lambda@Edge setup, deploy, callback.
- `source-docs/getting-started/netlify.md` - Netlify setup, run, deploy, context.
- `source-docs/getting-started/nextjs.md` - Next.js setup, run, deploy, Pages Router.
- `source-docs/getting-started/nodejs.md` - Node.js adapter setup and runtime notes.
- `source-docs/getting-started/service-worker.md` - Service Worker setup, hello world, `fire()`, run.
- `source-docs/getting-started/supabase-functions.md` - Supabase Edge Functions setup, run, deploy.
- `source-docs/getting-started/vercel.md` - Vercel setup, run, deploy.
- `source-docs/getting-started/webassembly-wasi.md` - WebAssembly with WASI setup, WIT, build, run.

## API

- `source-docs/api/context.md` - `Context`: `req`, `status`, `header`, body/text/json/html, redirects, response, variables, renderer, execution context, env, errors.
- `source-docs/api/exception.md` - `HTTPException`: throwing, custom messages/responses, cause, handling.
- `source-docs/api/hono.md` - `Hono` app methods, not found, error handling, `fire`, `fetch`, `request`, `mount`, strict mode, router option, generics.
- `source-docs/api/index.md` - API section index.
- `source-docs/api/presets.md` - `hono`, `hono/quick`, `hono/tiny`, preset selection.
- `source-docs/api/request.md` - `HonoRequest`: params, query, headers, body parsing, valid data, route metadata, raw request cloning.
- `source-docs/api/routing.md` - Routing basics, parameters, regexp, grouping, base path, host routing, priority, ordering.

## Guides

- `source-docs/guides/best-practices.md` - Controller guidance, factories, larger apps, RPC, HEAD request practices.
- `source-docs/guides/create-hono.md` - `create-hono` arguments, common options, example flows, offline cache, troubleshooting.
- `source-docs/guides/examples.md` - Example links.
- `source-docs/guides/faq.md` - FAQ.
- `source-docs/guides/helpers.md` - Helper overview and available helpers.
- `source-docs/guides/jsx-dom.md` - Client components, render, React-compatible hooks, view transitions, DOM runtime.
- `source-docs/guides/jsx.md` - JSX settings, usage, fragments, raw HTML, memoization, context, async components, suspense, error boundaries, streaming, renderer middleware.
- `source-docs/guides/middleware.md` - Middleware definition, execution order, built-in/custom/third-party middleware, context access, type inference.
- `source-docs/guides/others.md` - Contributing, sponsoring, resources.
- `source-docs/guides/rpc.md` - RPC server/client, cookies, status, global responses, not found, path params, headers, init, URL/path helpers, uploads, custom fetch/query serializer, infer, response parsing, SWR, large apps, IDE performance.
- `source-docs/guides/testing.md` - Testing with `app.request()`, request/response, env.
- `source-docs/guides/validation.md` - Manual validator, multiple validators, Zod, Zod Validator, Standard Schema Validator with Zod/Valibot/ArkType.

## Helpers

- `source-docs/helpers/accepts.md` - `accepts()` helper.
- `source-docs/helpers/adapter.md` - `env()` and runtime key helpers.
- `source-docs/helpers/conninfo.md` - Connection info helper.
- `source-docs/helpers/cookie.md` - Cookie parsing, signed cookies, generation, deletion, prefixes, best practices.
- `source-docs/helpers/css.md` - Experimental CSS helper, keyframes, `cx`, secure headers integration, CSS context.
- `source-docs/helpers/dev.md` - Dev helper, router name, route display.
- `source-docs/helpers/factory.md` - Factory helper, `createFactory`, `createMiddleware`, handlers, app creation.
- `source-docs/helpers/html.md` - `html` and `raw()` helpers.
- `source-docs/helpers/jwt.md` - JWT auth helper, sign, verify, decode, payload validation, errors, algorithms.
- `source-docs/helpers/proxy.md` - Proxy helper and connection header processing.
- `source-docs/helpers/route.md` - Route helper.
- `source-docs/helpers/ssg.md` - Static site generation helper.
- `source-docs/helpers/streaming.md` - Streaming helper.
- `source-docs/helpers/testing.md` - `testClient()` helper.
- `source-docs/helpers/websocket.md` - WebSocket helper, RPC mode, server/client examples, Bun with JSX, Node.js.

## Middleware

- `source-docs/middleware/third-party.md` - Third-party middleware grouped by authentication, validators, OpenAPI, development, monitoring, server/adapter, transpiler, UI, queue, i18n, utilities.

### Built-in Middleware

- `source-docs/middleware/builtin/basic-auth.md` - Basic Auth middleware options and recipes.
- `source-docs/middleware/builtin/bearer-auth.md` - Bearer Auth middleware options.
- `source-docs/middleware/builtin/body-limit.md` - Body Limit middleware and Bun large request note.
- `source-docs/middleware/builtin/cache.md` - Cache middleware options.
- `source-docs/middleware/builtin/combine.md` - Middleware combination utilities.
- `source-docs/middleware/builtin/compress.md` - Compress middleware options.
- `source-docs/middleware/builtin/context-storage.md` - Context Storage middleware and `tryGetContext`.
- `source-docs/middleware/builtin/cors.md` - CORS middleware, environment-dependent config, Vite usage.
- `source-docs/middleware/builtin/csrf.md` - CSRF protection options.
- `source-docs/middleware/builtin/etag.md` - ETag middleware options and retained headers.
- `source-docs/middleware/builtin/ip-restriction.md` - IP restriction middleware.
- `source-docs/middleware/builtin/jwk.md` - JWK Auth middleware, JWKS, verification options.
- `source-docs/middleware/builtin/jsx-renderer.md` - JSX renderer middleware, options, nested layouts, request context, renderer extension.
- `source-docs/middleware/builtin/jwt.md` - JWT Auth middleware options.
- `source-docs/middleware/builtin/language.md` - Language middleware, detection order, locale matching, cookies, recipes.
- `source-docs/middleware/builtin/logger.md` - Logger middleware, print function.
- `source-docs/middleware/builtin/method-override.md` - Method Override middleware.
- `source-docs/middleware/builtin/pretty-json.md` - Pretty JSON middleware options.
- `source-docs/middleware/builtin/request-id.md` - Request ID middleware options and platform IDs.
- `source-docs/middleware/builtin/secure-headers.md` - Secure Headers options, CSP, nonce, Permission-Policy.
- `source-docs/middleware/builtin/timeout.md` - Timeout middleware notes and conflicts.
- `source-docs/middleware/builtin/timing.md` - Server-Timing middleware options.
- `source-docs/middleware/builtin/trailing-slash.md` - Trailing slash middleware options.
