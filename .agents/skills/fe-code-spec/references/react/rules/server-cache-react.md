---
title: Per-Request Deduplication with React cache
impact: MEDIUM
impactDescription: deduplicates within request
tags: server, cache, react-cache, deduplication
---

## Per-Request Deduplication with React cache

Use React's `cache` API for server-side request deduplication when the project renders React on the server. Authentication checks, database queries, and expensive pure async work benefit when multiple components need the same result during one render.

**Usage:**

```typescript
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }

  return db.user.findUnique({
    where: { id: session.user.id },
  })
})
```

Within a single request/render, multiple calls to `getCurrentUser()` execute the query only once.

**Avoid inline objects as arguments:**

`cache` uses shallow equality (`Object.is`) to determine cache hits. Inline objects create new references each call, preventing cache hits.

**Incorrect (always cache miss):**

```typescript
const getUser = cache(async (params: { userId: number }) => {
  return db.user.findUnique({ where: { id: params.userId } })
})

await getUser({ userId: 1 })
await getUser({ userId: 1 })
```

**Correct (primitive args can hit cache):**

```typescript
const getUser = cache(async (params: { userId: number }) => {
  return db.user.findUnique({ where: { id: params.userId } })
})

const sharedParams = { userId: 1 }
await getUser(sharedParams)
await getUser(sharedParams)
```

Prefer primitive arguments when possible:

```typescript
const getUserById = cache(async (userId: number) => {
  return db.user.findUnique({ where: { id: userId } })
})

await getUserById(1)
await getUserById(1)
```

Use this only in server-rendering contexts where React's request cache semantics apply. For client components, use React Query, ahooks, or the project's existing client cache.

Reference: [React cache](https://react.dev/reference/react/cache)
