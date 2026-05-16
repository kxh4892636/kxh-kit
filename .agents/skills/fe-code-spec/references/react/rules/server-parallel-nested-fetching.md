---
title: Parallel Nested Data Fetching
impact: CRITICAL
impactDescription: eliminates server-side waterfalls
tags: server, parallel-fetching, promise-chaining
---

## Parallel Nested Data Fetching

When fetching nested data in parallel, chain dependent fetches within each item's promise so one slow parent item does not block nested fetches for every other item.

**Incorrect (one slow chat blocks all author fetches):**

```typescript
const chats = await Promise.all(
  chatIds.map((chatId) => getChat({ chatId })),
)

const chatAuthors = await Promise.all(
  chats.map((chat) => getUser({ userId: chat.authorId })),
)
```

If one `getChat` call is slow, the authors for all other chats wait even when their chat data is already available.

**Correct (each item chains its own nested fetch):**

```typescript
const chatAuthors = await Promise.all(
  chatIds.map((chatId) =>
    getChat({ chatId }).then((chat) =>
      getUser({ userId: chat.authorId }),
    ),
  ),
)
```

Each item independently chains `getChat` to `getUser`, so a slow item does not block nested fetches for the rest.

When the UI needs both parent and nested data, return a combined object from each chain:

```typescript
const chatCards = await Promise.all(
  chatIds.map(async (chatId) => {
    const chat = await getChat({ chatId })
    const author = await getUser({ userId: chat.authorId })
    return { author, chat }
  }),
)
```
