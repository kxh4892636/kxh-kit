# React Query Docs Map

This file routes TanStack Query React tasks to the bundled upstream docs snapshot in `references/source-docs/`.

The complete source content is preserved under `source-docs`; this map is only a navigation layer. If a prompt mentions an exact hook, option, status flag, cache method, plugin, or migration note, search the source snapshot before answering:

```powershell
rg -n "search term" .agents/skills/code-spec/references/react-query/references/source-docs
```

## Source Snapshot

- Upstream: `https://github.com/TanStack/query/tree/main/docs/framework/react`
- Local mirror: `references/source-docs/`
- Created from branch: `main`
- Snapshot date: `2026-05-31`
- Snapshot commit: `7fa2781a1b10a185091a50fd4d0d8ca168f4177b`
- File count at creation: `71`
- Source bytes at creation: `418,528`

## Fast Routing

| User asks about | Read these docs first |
| --- | --- |
| Overview, when to use server-state caching | `overview.md`, `comparison.md` |
| Install, requirements, first provider | `installation.md`, `quick-start.md`, `reference/QueryClientProvider.md` |
| Query basics and hook reference | `guides/queries.md`, `reference/useQuery.md` |
| Query keys | `guides/query-keys.md` |
| Query functions and error throwing | `guides/query-functions.md` |
| Query options helpers | `guides/query-options.md`, `reference/queryOptions.md` |
| Mutations | `guides/mutations.md`, `reference/useMutation.md`, `reference/mutationOptions.md` |
| Query invalidation | `guides/query-invalidation.md`, `guides/invalidations-from-mutations.md` |
| Cache updates from mutation responses | `guides/updates-from-mutation-responses.md` |
| Optimistic updates | `guides/optimistic-updates.md` |
| Infinite queries | `guides/infinite-queries.md`, `reference/useInfiniteQuery.md`, `reference/infiniteQueryOptions.md` |
| Pagination and placeholder data | `guides/paginated-queries.md`, `guides/placeholder-query-data.md` |
| Parallel queries | `guides/parallel-queries.md`, `reference/useQueries.md` |
| Dependent or lazy queries | `guides/dependent-queries.md`, `guides/disabling-queries.md` |
| Background fetching and polling | `guides/background-fetching-indicators.md`, `guides/polling.md` |
| Caching defaults, stale time, gc time, retries | `guides/caching.md`, `guides/important-defaults.md`, `guides/query-retries.md` |
| Prefetching and waterfalls | `guides/prefetching.md`, `guides/request-waterfalls.md` |
| SSR and hydration | `guides/ssr.md`, `guides/advanced-ssr.md`, `reference/hydration.md` |
| Suspense and error boundaries | `guides/suspense.md`, `reference/QueryErrorResetBoundary.md`, `reference/useQueryErrorResetBoundary.md` |
| Cancellation | `guides/query-cancellation.md` |
| Focus and network behavior | `guides/window-focus-refetching.md`, `guides/network-mode.md` |
| Render optimization | `guides/render-optimizations.md` |
| TypeScript | `typescript.md` |
| Testing | `guides/testing.md` |
| Devtools | `devtools.md` |
| Persistence, storage, broadcast | `plugins/persistQueryClient.md`, `plugins/createPersister.md`, `plugins/createAsyncStoragePersister.md`, `plugins/createSyncStoragePersister.md`, `plugins/broadcastQueryClient.md` |
| React Native | `react-native.md` |
| GraphQL and codegen | `graphql.md` |
| Migration guides | `guides/migrating-to-react-query-3.md`, `guides/migrating-to-react-query-4.md`, `guides/migrating-to-v5.md` |

## Complete File Inventory

For each file below, the source URL is:

```text
https://github.com/TanStack/query/tree/main/docs/framework/react/<local-path>
```

| Local file |
| --- |
| `comparison.md` |
| `devtools.md` |
| `graphql.md` |
| `guides/advanced-ssr.md` |
| `guides/background-fetching-indicators.md` |
| `guides/caching.md` |
| `guides/default-query-function.md` |
| `guides/dependent-queries.md` |
| `guides/disabling-queries.md` |
| `guides/does-this-replace-client-state.md` |
| `guides/filters.md` |
| `guides/important-defaults.md` |
| `guides/infinite-queries.md` |
| `guides/initial-query-data.md` |
| `guides/invalidations-from-mutations.md` |
| `guides/migrating-to-react-query-3.md` |
| `guides/migrating-to-react-query-4.md` |
| `guides/migrating-to-v5.md` |
| `guides/mutations.md` |
| `guides/network-mode.md` |
| `guides/optimistic-updates.md` |
| `guides/paginated-queries.md` |
| `guides/parallel-queries.md` |
| `guides/placeholder-query-data.md` |
| `guides/polling.md` |
| `guides/prefetching.md` |
| `guides/queries.md` |
| `guides/query-cancellation.md` |
| `guides/query-functions.md` |
| `guides/query-invalidation.md` |
| `guides/query-keys.md` |
| `guides/query-options.md` |
| `guides/query-retries.md` |
| `guides/render-optimizations.md` |
| `guides/request-waterfalls.md` |
| `guides/scroll-restoration.md` |
| `guides/ssr.md` |
| `guides/suspense.md` |
| `guides/testing.md` |
| `guides/updates-from-mutation-responses.md` |
| `guides/window-focus-refetching.md` |
| `installation.md` |
| `overview.md` |
| `plugins/broadcastQueryClient.md` |
| `plugins/createAsyncStoragePersister.md` |
| `plugins/createPersister.md` |
| `plugins/createSyncStoragePersister.md` |
| `plugins/persistQueryClient.md` |
| `quick-start.md` |
| `react-native.md` |
| `reference/hydration.md` |
| `reference/infiniteQueryOptions.md` |
| `reference/mutationOptions.md` |
| `reference/QueryClientProvider.md` |
| `reference/QueryErrorResetBoundary.md` |
| `reference/queryOptions.md` |
| `reference/useInfiniteQuery.md` |
| `reference/useIsFetching.md` |
| `reference/useIsMutating.md` |
| `reference/useMutation.md` |
| `reference/useMutationState.md` |
| `reference/usePrefetchInfiniteQuery.md` |
| `reference/usePrefetchQuery.md` |
| `reference/useQueries.md` |
| `reference/useQuery.md` |
| `reference/useQueryClient.md` |
| `reference/useQueryErrorResetBoundary.md` |
| `reference/useSuspenseInfiniteQuery.md` |
| `reference/useSuspenseQueries.md` |
| `reference/useSuspenseQuery.md` |
| `typescript.md` |
