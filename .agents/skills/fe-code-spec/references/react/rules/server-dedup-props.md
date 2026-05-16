---
title: Avoid Duplicate Serialization in Server-to-Client Props
impact: LOW
impactDescription: reduces network payload by avoiding duplicate serialization
tags: server, serialization, props, client-components
---

## Avoid Duplicate Serialization in Server-to-Client Props

When server-rendered React passes props to client-rendered components, payload size matters. Prefer passing one canonical value and deriving alternate views on the client when the client already needs the original data.

**Incorrect (duplicates array payload):**

```tsx
export const Page = async () => {
  const usernames = await fetchUsernames()

  return (
    <ClientList
      usernames={usernames}
      usernamesOrdered={usernames.toSorted()}
    />
  )
}
```

**Correct (send once, derive locally):**

```tsx
export const Page = async () => {
  const usernames = await fetchUsernames()
  return <ClientList usernames={usernames} />
}
```

```tsx
export const ClientList = (props: { usernames: string[] }) => {
  const usernamesOrdered = useMemo(
    () => props.usernames.toSorted(),
    [props.usernames],
  )

  return <UserList usernames={usernamesOrdered} />
}
```

Operations that create new references can increase the serialized payload:

- Arrays: `.toSorted()`, `.filter()`, `.map()`, `.slice()`, `[...items]`
- Objects: `{ ...value }`, `Object.assign()`, `structuredClone()`

Exception: pass derived data when the transformation is expensive, when the client does not need the original data, or when sending the derived slice is smaller than sending the full source.
