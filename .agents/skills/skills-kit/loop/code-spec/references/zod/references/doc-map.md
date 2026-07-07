# Zod Docs Map

This file routes Zod tasks to the bundled upstream docs snapshot in `references/source-docs/`.

The complete source content is preserved under `source-docs`; this map is only a navigation layer. If a prompt mentions an exact API, option, issue code, package subpath, or migration note, search the source snapshot before answering:

```powershell
rg -n "search term" packages/skills-kit/loop/code-spec/references/zod/references/source-docs
```

## Source Snapshot

- Upstream: `https://github.com/colinhacks/zod/tree/main/packages/docs/content`
- Local mirror: `references/source-docs/`
- Created from branch: `main`
- Snapshot date: `2026-05-31`
- Snapshot commit: `bbc68f990c7e6a5e3f506c56fb04bd0279b9c9b5`
- File count at creation: `19`
- Source bytes at creation: `262,918`

Use `source-docs/meta.json` as the official sidebar/order for the main docs.

## Fast Routing

| User asks about                                                                                                  | Read these docs first                                        |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| What Zod is, install, requirements, strict TypeScript mode                                                       | `index.mdx`                                                  |
| Defining schemas, parsing data, handling errors, inferring types                                                 | `basics.mdx`                                                 |
| Any specific schema API or method                                                                                | `api.mdx`                                                    |
| Primitives, coercion, literals, strings, formats, numbers, dates, enums                                          | `api.mdx`                                                    |
| Objects, strict/loose object behavior, catchall, shape, keyof, extend, safeExtend, pick, omit, partial, required | `api.mdx`                                                    |
| Recursive schemas, arrays, tuples, unions, discriminated unions, intersections, records                          | `api.mdx`                                                    |
| Maps, sets, files, promises, instanceof, property checks                                                         | `api.mdx`                                                    |
| `refine`, `superRefine`, `check`, custom validation                                                              | `api.mdx`                                                    |
| Transforms, pipes, defaults, prefaults, catch, branded, readonly, functions                                      | `api.mdx`                                                    |
| Codecs, encode/decode, useful built-in codecs                                                                    | `codecs.mdx`                                                 |
| Error messages, error maps, locales, i18n, precedence                                                            | `error-customization.mdx`                                    |
| Formatting Zod errors for forms or trees                                                                         | `error-formatting.mdx`                                       |
| Metadata, registries, `meta`, `describe`, global registry                                                        | `metadata.mdx`                                               |
| Convert to or from JSON Schema                                                                                   | `json-schema.mdx`                                            |
| Ecosystem packages and integrations                                                                              | `ecosystem.mdx`                                              |
| Library author guidance, peer dependencies, supporting v3/v4 and Zod Mini                                        | `library-authors.mdx`                                        |
| Package-specific docs for Zod, Zod Mini, Zod Core                                                                | `packages/zod.mdx`, `packages/mini.mdx`, `packages/core.mdx` |
| Zod 4 release notes, migration guide, versioning strategy                                                        | `v4/index.mdx`, `v4/changelog.mdx`, `v4/versioning.mdx`      |

## Complete File Inventory

For each file below, the source URL is:

```text
https://github.com/colinhacks/zod/tree/main/packages/docs/content/<local-path>
```

| Local file                  | Primary use                                              |
| --------------------------- | -------------------------------------------------------- |
| `api.mdx`                   | Complete API reference for schema types and methods      |
| `api.test.ts`               | Source docs test examples                                |
| `basics.mdx`                | Basic schema, parse, error, and inference workflow       |
| `blog/clerk-fellowship.mdx` | Zod project/funding blog content in the docs tree        |
| `codecs.mdx`                | Bidirectional codec guidance and built-in codec examples |
| `ecosystem.mdx`             | Ecosystem resources and integrations                     |
| `error-customization.mdx`   | Error customization, locales, and precedence             |
| `error-formatting.mdx`      | Error formatting helpers                                 |
| `index.mdx`                 | Intro, features, install, requirements                   |
| `json-schema.mdx`           | JSON Schema import/export                                |
| `library-authors.mdx`       | Library integration guidance                             |
| `meta.json`                 | Main docs sidebar metadata                               |
| `metadata.mdx`              | Registries and metadata                                  |
| `packages/core.mdx`         | Zod Core package internals                               |
| `packages/mini.mdx`         | Zod Mini package docs                                    |
| `packages/zod.mdx`          | Main Zod package docs                                    |
| `v4/changelog.mdx`          | Zod 4 migration guide and breaking changes               |
| `v4/index.mdx`              | Zod 4 release notes                                      |
| `v4/versioning.mdx`         | Zod 4 versioning policy                                  |
