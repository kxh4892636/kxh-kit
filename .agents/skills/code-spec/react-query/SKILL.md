---
name: react-query
description: TanStack Query / React Query 官方文档型开发技能。凡是用户提到 @tanstack/react-query、TanStack Query、React Query、QueryClient、QueryClientProvider、useQuery、useMutation、useInfiniteQuery、useQueries、queryKey、invalidateQueries、prefetch、hydrate/dehydrate、SSR、Suspense、optimistic update、query cache、mutation cache、persistQueryClient 或 React 服务端状态请求封装时都应使用，并优先读取本 skill 打包的官方 React docs 快照。
---

# React Query Skill

Use this skill for TanStack Query React work: query client setup, server state hooks, query keys, query functions, mutations, invalidation, optimistic updates, infinite queries, prefetching, SSR/hydration, Suspense, persistence, testing, and TypeScript typing.

**Source docs:** https://github.com/TanStack/query/tree/main/docs/framework/react

## Completion Standard

A React Query answer is complete when it:

- Identifies whether the task is setup/provider, query, mutation, invalidation, pagination/infinite query, SSR/hydration, Suspense, persistence, testing, or migration.
- Checks the bundled official docs before answering detailed API, option, SSR, mutation, invalidation, or migration questions.
- Uses stable query keys that include every variable the query function depends on.
- Ensures query functions reject or throw on failure, especially when wrapping `fetch`.
- Handles loading, error, stale data, invalidation, and cache updates according to the requested UX.
- Preserves the project's existing query client, query-key factories, API wrappers, hook naming, and error conventions.
- Calls out assumptions when the prompt omits data ownership, cache lifetime, stale behavior, SSR framework, or mutation consistency requirements.

## First Steps

1. Read `references/doc-map.md` to choose the relevant bundled source docs.
2. Read the exact files under `references/source-docs/` before answering detailed API/config questions.
3. If the user asks for the latest release, latest API behavior, package versions, or anything that may have changed after this snapshot, browse official TanStack Query sources or npm before finalizing.
4. When modifying a repo, inspect existing `QueryClient`, providers, query hooks, query-key helpers, and API wrappers before adding new patterns.

## Source Docs Layout

The full upstream `docs/framework/react` snapshot is included under:

```text
references/source-docs/
```

Important entry points:

| Topic | Read |
| --- | --- |
| Fast routing index | `references/doc-map.md` |
| Overview and motivation | `references/source-docs/overview.md` |
| Install and requirements | `references/source-docs/installation.md` |
| Quick start | `references/source-docs/quick-start.md` |
| Core guides | `references/source-docs/guides/*.md` |
| Hook and API references | `references/source-docs/reference/*.md` |
| TypeScript guide | `references/source-docs/typescript.md` |
| Devtools | `references/source-docs/devtools.md` |
| Plugins and persistence | `references/source-docs/plugins/*.md` |
| Migration guides | `references/source-docs/guides/migrating-to-*.md` |

Use `rg` over `references/source-docs` when a user names a specific hook, option, status field, cache method, plugin, or migration concern.

## Task Routing

| User asks about | Read these docs first |
| --- | --- |
| Install, provider setup, first query/mutation | `installation.md`, `quick-start.md`, `reference/QueryClientProvider.md` |
| Query basics, status flags, fetching state | `guides/queries.md`, `reference/useQuery.md` |
| Query keys and query functions | `guides/query-keys.md`, `guides/query-functions.md` |
| Type-safe query options and reusable options | `guides/query-options.md`, `reference/queryOptions.md`, `typescript.md` |
| Mutations and mutation options | `guides/mutations.md`, `reference/useMutation.md`, `reference/mutationOptions.md` |
| Invalidation after mutations | `guides/query-invalidation.md`, `guides/invalidations-from-mutations.md` |
| Updating cache from mutation responses | `guides/updates-from-mutation-responses.md` |
| Optimistic updates | `guides/optimistic-updates.md` |
| Infinite queries and pagination | `guides/infinite-queries.md`, `guides/paginated-queries.md`, `reference/useInfiniteQuery.md` |
| Parallel/dependent queries | `guides/parallel-queries.md`, `guides/dependent-queries.md`, `reference/useQueries.md` |
| Disabled/lazy queries and `skipToken` | `guides/disabling-queries.md`, `typescript.md` |
| Prefetching and request waterfalls | `guides/prefetching.md`, `guides/request-waterfalls.md` |
| SSR, hydration, Next.js app router, streaming | `guides/ssr.md`, `guides/advanced-ssr.md`, `reference/hydration.md` |
| Suspense and error boundaries | `guides/suspense.md`, `reference/QueryErrorResetBoundary.md` |
| Cancellation, retries, focus/refetch, network mode | `guides/query-cancellation.md`, `guides/query-retries.md`, `guides/window-focus-refetching.md`, `guides/network-mode.md` |
| Render optimization and selectors | `guides/render-optimizations.md` |
| Testing | `guides/testing.md` |
| Devtools | `devtools.md` |
| Persistence and broadcast plugins | `plugins/*.md` |
| React Native | `react-native.md` |
| Migrating v3/v4/v5 | `guides/migrating-to-react-query-3.md`, `guides/migrating-to-react-query-4.md`, `guides/migrating-to-v5.md` |

## Implementation Workflow

For repo changes:

1. Find existing TanStack Query usage with `rg -n "@tanstack/react-query|useQuery|useMutation|QueryClient|queryKey|invalidateQueries"`.
2. Check package versions and framework setup before choosing APIs.
3. Identify the data ownership model: server state belongs in TanStack Query; local UI state belongs in component/store state.
4. Choose docs from the routing table and read the exact relevant reference file.
5. Implement the smallest coherent hook/provider/cache change.
6. Preserve existing API wrapper error behavior; wrap `fetch` so non-2xx responses throw if the project has not already done so.
7. Run the repo's existing format/type/test checks when the task changes code.

## React Query Guidance

- Put variables that influence the fetch into the query key, not only into the query function.
- Keep query keys serializable and predictable; follow existing query-key factory patterns when present.
- Prefer invalidation after mutations when the server returns canonical data from multiple sources; use direct cache updates when the response is sufficient and the affected query set is clear.
- Use optimistic updates only when the rollback path and concurrent mutation behavior are understood.
- Use `enabled` or `skipToken` for dependent/lazy queries rather than calling hooks conditionally.
- Tune `staleTime`, `gcTime`, retries, and refetch-on-focus based on product requirements instead of cargo-culting defaults.
- Use `select` for derived views, but keep it stable when memoization matters.
- For SSR/hydration, create query clients in the documented scope for the framework and avoid sharing request-specific cache across users.

## Updating This Skill

The bundled source docs were extracted from the GitHub docs directory. To refresh:

```powershell
pwsh .agents/skills/code-spec/react-query/scripts/update-source-docs.ps1
```

Then review `references/source-docs/`, `references/doc-map.md`, `references/snapshot.json`, and this `SKILL.md` against upstream changes. If new guides, hooks, plugins, or migration topics appear, update the routing tables and the parent `code-spec` routing entry.
