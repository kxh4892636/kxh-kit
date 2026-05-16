---
title: Cross-Request LRU Caching
impact: HIGH
impactDescription: caches across requests
tags: server, cache, lru, cross-request
---

## Cross-Request LRU Caching

For data shared across sequential requests in the same long-lived process, use a bounded cache with a TTL. An LRU cache avoids repeated database or API calls while preventing unbounded memory growth.

**Implementation:**

```typescript
import { LRUCache } from 'lru-cache'

const userCache = new LRUCache<string, User | null>({
  max: 1_000,
  ttl: 5 * 60 * 1_000,
})

export const getUser = async (params: { id: string }) => {
  const cached = userCache.get(params.id)
  if (cached !== undefined) {
    return cached
  }

  const user = await db.user.findUnique({ where: { id: params.id } })
  userCache.set(params.id, user)
  return user
}
```

Use this when sequential user actions hit multiple handlers that need the same data within seconds.

**When to use an in-process LRU:**

- The runtime keeps processes warm across multiple requests.
- Stale data is acceptable for the configured TTL.
- Cache keys include all authorization-relevant dimensions.
- Memory use is bounded with `max`, `ttl`, or both.

**When not to use it:**

- The data must be immediately consistent after writes.
- The runtime isolates every request.
- The cache contains user-specific data without user-specific keys.
- A distributed cache is required across processes or machines.

Reference: [lru-cache](https://github.com/isaacs/node-lru-cache)
