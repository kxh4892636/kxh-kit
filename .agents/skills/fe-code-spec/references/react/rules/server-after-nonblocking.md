---
title: Defer Post-Response Side Effects
impact: MEDIUM
impactDescription: faster response times
tags: server, async, logging, analytics, side-effects
---

## Defer Post-Response Side Effects

Logging, analytics, notifications, and cleanup often do not need to block the user-facing response. Schedule them after the response-critical mutation has completed. Use the runtime's background task primitive when available; otherwise use a queue, worker, or best-effort asynchronous task with clear reliability expectations.

**Incorrect (logging blocks the response):**

```typescript
export const handleUpdateProfile = async (request: Request) => {
  await updateProfile(request)

  const userAgent = request.headers.get('user-agent') || 'unknown'
  await logUserAction({ action: 'profile.update', userAgent })

  return Response.json({ status: 'success' })
}
```

**Correct (response is not delayed by non-critical work):**

```typescript
const scheduleBackgroundTask = (task: () => Promise<void>) => {
  setTimeout(() => {
    void task().catch((error) => {
      console.error('background task failed', error)
    })
  }, 0)
}

export const handleUpdateProfile = async (request: Request) => {
  await updateProfile(request)

  const userAgent = request.headers.get('user-agent') || 'unknown'
  scheduleBackgroundTask(async () => {
    await logUserAction({ action: 'profile.update', userAgent })
  })

  return Response.json({ status: 'success' })
}
```

Use this pattern for analytics tracking, audit logging, notifications, cache invalidation, and cleanup tasks. Do not use it for work that must complete before the caller can safely continue. For durable work, prefer a real queue or job system over an in-process timer.
