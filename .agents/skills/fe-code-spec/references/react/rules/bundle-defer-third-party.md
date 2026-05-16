---
title: Defer Non-Critical Third-Party Libraries
impact: MEDIUM
impactDescription: loads after hydration
tags: bundle, third-party, analytics, defer
---

## Defer Non-Critical Third-Party Libraries

Analytics, logging, and error tracking should not block the first interactive render. Load them after mount, after user consent, or during idle time.

**Incorrect (blocks initial bundle):**

```tsx
import { initAnalytics } from './analytics-sdk'

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  initAnalytics()

  return (
    <main>
      {children}
    </main>
  )
}
```

**Correct (loads after mount/idle):**

```tsx
export const AppShell = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    const load = () => {
      void import('./analytics-sdk').then((mod) => {
        mod.initAnalytics()
      })
    }

    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(load)
      return () => window.cancelIdleCallback(id)
    }

    const id = window.setTimeout(load, 1_000)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <main>
      {children}
    </main>
  )
}
```
