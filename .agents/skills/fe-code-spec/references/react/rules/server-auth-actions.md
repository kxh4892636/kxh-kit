---
title: Authenticate Server Mutation Handlers
impact: CRITICAL
impactDescription: prevents unauthorized server mutations
tags: server, mutations, authentication, security, authorization
---

## Authenticate Server Mutation Handlers

Treat every server-side mutation handler as a public entry point. Verify authentication, authorization, and input validity inside the handler. Do not rely only on route guards, page guards, or client-side UI checks, because mutation functions can often be invoked outside the intended UI path.

**Incorrect (no authentication check):**

```typescript
export const deleteUser = async (params: { userId: string }) => {
  await db.user.delete({ where: { id: params.userId } })
  return { success: true }
}
```

**Correct (authenticate and authorize inside the handler):**

```typescript
export const deleteUser = async (params: { userId: string }) => {
  const session = await verifySession()

  if (!session) {
    throw new Error('Unauthorized')
  }

  const canDelete =
    session.user.role === 'admin' || session.user.id === params.userId

  if (!canDelete) {
    throw new Error('Forbidden')
  }

  await db.user.delete({ where: { id: params.userId } })
  return { success: true }
}
```

**With input validation:**

```typescript
const updateProfileSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
})

export const updateProfile = async (params: { data: unknown }) => {
  const data = updateProfileSchema.parse(params.data)
  const session = await verifySession()

  if (!session) {
    throw new Error('Unauthorized')
  }

  if (session.user.id !== data.userId) {
    throw new Error('Can only update own profile')
  }

  await db.user.update({
    where: { id: data.userId },
    data: {
      email: data.email,
      name: data.name,
    },
  })

  return { success: true }
}
```

Validate first when validation is cheap and protects downstream code. Authenticate before expensive work when unauthenticated calls are common or abusive traffic is a concern.
