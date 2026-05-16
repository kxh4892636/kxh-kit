---
title: Prevent Waterfall Chains in HTTP Handlers
impact: CRITICAL
impactDescription: 2-10x improvement
tags: async, http-handlers, waterfalls, parallelization
---

## Prevent Waterfall Chains in HTTP Handlers

In HTTP handlers, RPC handlers, loaders, or server-side request functions, start independent operations immediately, even if you do not await them until later. This removes avoidable latency from request paths.

**Incorrect (config waits for auth, data waits for both):**

```typescript
export const handleGetDashboard = async (request: Request) => {
  const session = await auth(request)
  const config = await fetchConfig()
  const data = await fetchData(session.user.id)

  return Response.json({ config, data })
}
```

**Correct (auth and config start immediately):**

```typescript
export const handleGetDashboard = async (request: Request) => {
  const sessionPromise = auth(request)
  const configPromise = fetchConfig()

  const session = await sessionPromise
  const [config, data] = await Promise.all([
    configPromise,
    fetchData(session.user.id),
  ])

  return Response.json({ config, data })
}
```

For operations with more complex dependency chains, start each independent promise as soon as its inputs are available. Only add a dependency orchestration library when the project already uses one or the dependency graph is difficult to read safely by hand.
