---
title: Dynamic Imports for Heavy Components
impact: CRITICAL
impactDescription: directly affects TTI and LCP
tags: bundle, dynamic-import, code-splitting, react-lazy, vite
---

## Dynamic Imports for Heavy Components

Use React/Vite dynamic imports to lazy-load large components not needed on initial render.

**Incorrect (Monaco bundles with main chunk ~300KB):**

```tsx
import { MonacoEditor } from './monaco-editor'

const CodePanel = ({ code }: { code: string }) => {
  return <MonacoEditor value={code} />
}
```

**Correct (Monaco loads on demand):**

```tsx
import { lazy, Suspense } from 'react'

const MonacoEditor = lazy(() =>
  import('./monaco-editor').then((mod) => ({ default: mod.MonacoEditor }))
)

const CodePanel = ({ code }: { code: string }) => {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <MonacoEditor value={code} />
    </Suspense>
  )
}
```

If the component should load only after a click, use event-triggered `import()` instead of rendering a lazy component immediately.
