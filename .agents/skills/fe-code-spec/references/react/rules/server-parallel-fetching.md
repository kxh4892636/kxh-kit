---
title: Parallel Data Fetching with Component Composition
impact: CRITICAL
impactDescription: eliminates server-side waterfalls
tags: server, ssr, parallel-fetching, composition
---

## Parallel Data Fetching with Component Composition

In server-rendered React trees, a parent that awaits data before rendering children can accidentally serialize child data fetching. Restructure independent sections as sibling components or start promises before awaiting.

**Incorrect (sidebar waits for the header fetch):**

```tsx
export const Page = async () => {
  const header = await fetchHeader()

  return (
    <div>
      <div>{header.title}</div>
      <Sidebar />
    </div>
  )
}

const Sidebar = async () => {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}
```

**Correct (both sections can fetch independently):**

```tsx
const Header = async () => {
  const data = await fetchHeader()
  return <div>{data.title}</div>
}

const Sidebar = async () => {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}

export const Page = () => {
  return (
    <div>
      <Header />
      <Sidebar />
    </div>
  )
}
```

**Alternative (start promises before awaiting):**

```tsx
export const Page = async () => {
  const headerPromise = fetchHeader()
  const itemsPromise = fetchSidebarItems()

  const [header, items] = await Promise.all([
    headerPromise,
    itemsPromise,
  ])

  return <Dashboard header={header} items={items} />
}
```

Use the composition pattern when it keeps each section locally responsible for its data. Use explicit promises when the data must be joined in one parent.
