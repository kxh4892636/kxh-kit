---
title: Hoist Static I/O to Module Level
impact: HIGH
impactDescription: avoids repeated file/network I/O per request
tags: server, io, performance, static-assets
---

## Hoist Static I/O to Module Level

When loading static assets, config files, schemas, templates, or other data that is identical across requests, hoist the I/O operation to module level. Module-level code runs when the module is initialized, not on every handler call.

**Incorrect (reads config and template on every call):**

```typescript
import fs from 'node:fs/promises'

export const renderEmail = async (params: { data: EmailData }) => {
  const config = JSON.parse(
    await fs.readFile('./email-config.json', 'utf-8'),
  )
  const template = await fs.readFile('./template.html', 'utf-8')

  return renderTemplate({ config, data: params.data, template })
}
```

**Correct (starts static reads at module initialization):**

```typescript
import fs from 'node:fs/promises'

const configPromise = fs
  .readFile('./email-config.json', 'utf-8')
  .then(JSON.parse)
const templatePromise = fs.readFile('./template.html', 'utf-8')

export const renderEmail = async (params: { data: EmailData }) => {
  const [config, template] = await Promise.all([
    configPromise,
    templatePromise,
  ])

  return renderTemplate({ config, data: params.data, template })
}
```

**Correct (synchronous read at module level for small static assets):**

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const logoSvg = readFileSync(
  join(process.cwd(), 'public/logo.svg'),
  'utf-8',
)

export const renderHeader = () => {
  return renderSvgHeader({ logoSvg })
}
```

Use this pattern for fonts, logos, static templates, stable config, and schema files. Do not use it for per-user data, files that change during runtime, very large assets, or sensitive values that should not persist in process memory.
