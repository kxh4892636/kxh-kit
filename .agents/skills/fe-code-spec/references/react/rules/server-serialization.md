---
title: Minimize Server-to-Client Serialization
impact: HIGH
impactDescription: reduces data transfer size
tags: server, serialization, props
---

## Minimize Server-to-Client Serialization

When server-rendered React passes data to client-rendered components, every prop affects payload size and hydration work. Pass only the fields the client actually uses.

**Incorrect (serializes all fields):**

```tsx
export const Page = async () => {
  const user = await fetchUser()
  return <Profile user={user} />
}

export const Profile = (props: { user: User }) => {
  return <div>{props.user.name}</div>
}
```

If `User` has 50 fields and the client only uses `name`, the extra fields still travel through the server-to-client boundary.

**Correct (serializes only what the client uses):**

```tsx
export const Page = async () => {
  const user = await fetchUser()
  return <Profile name={user.name} />
}

export const Profile = (props: { name: string }) => {
  return <div>{props.name}</div>
}
```

Prefer small DTOs at server-to-client boundaries:

```typescript
interface ProfileViewModel {
  name: string
  avatarUrl?: string
}

const toProfileViewModel = (user: User): ProfileViewModel => ({
  avatarUrl: user.avatarUrl,
  name: user.name,
})
```

Do not strip fields that the client will immediately need for interaction. The goal is to avoid unused payload, not to create extra follow-up requests.
