---
title: Suppress Expected Hydration Mismatches
impact: LOW-MEDIUM
impactDescription: avoids noisy hydration warnings for known differences
tags: rendering, hydration, ssr
---

## Suppress Expected Hydration Mismatches

In SSR/hydration projects, some values are intentionally different on server vs client, such as dates, locale/timezone formatting, or client-generated IDs. For these expected mismatches, wrap only the dynamic text in an element with `suppressHydrationWarning` to prevent noisy warnings. Do not use this to hide real bugs. Do not apply it broadly.

**Incorrect (known mismatch warnings):**

```tsx
const Timestamp = () => {
  return <span>{new Date().toLocaleString()}</span>
}
```

**Correct (suppress expected mismatch only):**

```tsx
const Timestamp = () => {
  return (
    <span suppressHydrationWarning>
      {new Date().toLocaleString()}
    </span>
  )
}
```
