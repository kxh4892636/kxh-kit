---
title: Avoid Shared Module State for Request Data
impact: HIGH
impactDescription: prevents concurrency bugs and request data leaks
tags: server, ssr, concurrency, security, state
---

## Avoid Shared Module State for Request Data

For server-rendered React, avoid using mutable module-level variables to share request-scoped data. Server renders can run concurrently in the same process. If one render writes to shared module state and another render reads it, user data can leak across requests.

Treat module scope on the server as process-wide shared memory, not request-local state.

**Incorrect (request data can leak across concurrent renders):**

```tsx
let currentUser: User | null = null

export const Page = async () => {
  currentUser = await auth()
  return <Dashboard />
}

const Dashboard = async () => {
  return <div>{currentUser?.name}</div>
}
```

If two requests overlap, request A can set `currentUser`, then request B overwrites it before request A finishes rendering `Dashboard`.

**Correct (keep request data local to the render tree):**

```tsx
export const Page = async () => {
  const user = await auth()
  return <Dashboard user={user} />
}

const Dashboard = (props: { user: User | null }) => {
  return <div>{props.user?.name}</div>
}
```

Safe exceptions:

- Immutable static assets or config loaded once at module scope
- Shared caches intentionally designed for cross-request reuse and keyed correctly
- Process-wide singletons that do not store request- or user-specific mutable data

For static assets and config, see [Hoist Static I/O to Module Level](./server-hoist-static-io.md).
