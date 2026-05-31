---
name: zod
description: Zod 官方文档型开发技能。凡是用户提到 Zod、zod schema、parse/safeParse、ZodError、refine/superRefine、transform、codec、JSON Schema、z.infer、z.input、z.output、zod/mini、zod/v4/core，或需要为 TypeScript 前后端实现、调试、迁移或评审运行时数据校验时都应使用，并优先读取本 skill 打包的官方 docs 快照。
---

# Zod Skill

Use this skill for Zod schema validation work: runtime parsing, TypeScript inference, error handling, refinements, transforms, codecs, JSON Schema conversion, package selection, and Zod 4 migration questions.

**Source docs:** https://github.com/colinhacks/zod/tree/main/packages/docs/content

## Completion Standard

A Zod answer is complete when it:

- Identifies whether the code should use `zod`, `zod/mini`, or `zod/v4/core` when package choice affects imports or API style.
- Checks the bundled official docs before answering detailed API, error, transform, codec, JSON Schema, or migration questions.
- Distinguishes runtime input validation from TypeScript output inference, using `z.infer`, `z.input`, or `z.output` when transforms/codecs make that distinction matter.
- Chooses `parse`, `safeParse`, `parseAsync`, or `safeParseAsync` based on error-flow and async refinement/transform needs.
- Preserves project conventions for schema location, naming, exported types, request validation, and error formatting.
- Calls out assumptions when the user omits Zod major version, package subpath, runtime boundary, or expected error shape.

## First Steps

1. Read `references/doc-map.md` to choose the relevant bundled source docs.
2. Read the exact files under `references/source-docs/` before answering detailed API or migration questions.
3. If the user asks for the latest release, latest API behavior, package versions, or anything that may have changed after this snapshot, browse official Zod sources or npm before finalizing.
4. When modifying a repo, inspect existing schema files and validation call sites before introducing new patterns.

## Source Docs Layout

The full upstream `packages/docs/content` snapshot is included under:

```text
references/source-docs/
```

Important entry points:

| Topic | Read |
| --- | --- |
| Official sidebar / route order | `references/source-docs/meta.json` |
| Fast routing index | `references/doc-map.md` |
| Intro, install, requirements | `references/source-docs/index.mdx` |
| Defining schemas, parsing, errors, inference | `references/source-docs/basics.mdx` |
| Full API surface | `references/source-docs/api.mdx` |
| Error customization | `references/source-docs/error-customization.mdx` |
| Error formatting helpers | `references/source-docs/error-formatting.mdx` |
| Metadata and registries | `references/source-docs/metadata.mdx` |
| JSON Schema conversion | `references/source-docs/json-schema.mdx` |
| Codecs and bidirectional transforms | `references/source-docs/codecs.mdx` |
| Package variants | `references/source-docs/packages/*.mdx` |
| Zod 4 release and migration | `references/source-docs/v4/*.mdx` |

Use `rg` over `references/source-docs` when a user names a specific method, option, issue code, package subpath, or migration concern.

## Task Routing

| User asks about | Read these docs first |
| --- | --- |
| Install, setup, requirements, Zod 4 status | `index.mdx`, `v4/index.mdx` |
| Basic schema declaration, parsing, type inference | `basics.mdx` |
| Primitive types, objects, arrays, unions, records, maps, sets, files | `api.mdx` |
| Object composition, strict/loose objects, extend, pick, omit, partial | `api.mdx` |
| Refinements, `refine`, `superRefine`, `check` | `api.mdx` |
| Transforms, pipes, defaults, prefaults, catch, branded, readonly | `api.mdx` |
| Codecs, encode/decode, built-in codecs | `codecs.mdx`, `api.mdx` |
| Error messages, locales, global/per-parse customization | `error-customization.mdx` |
| `treeifyError`, `prettifyError`, `flattenError`, `formatError` | `error-formatting.mdx` |
| Metadata, registries, `meta`, `describe` | `metadata.mdx` |
| `z.toJSONSchema`, `z.fromJSONSchema`, representability rules | `json-schema.mdx` |
| Library author integration and peer dependency strategy | `library-authors.mdx`, `packages/core.mdx` |
| Zod Mini and tree-shaking | `packages/mini.mdx` |
| Zod 3 to Zod 4 migration | `v4/changelog.mdx`, `v4/versioning.mdx` |

## Implementation Workflow

For repo changes:

1. Find existing Zod usage with `rg -n "zod|safeParse|parseAsync|ZodError|z\\.object"`.
2. Check package versions and import style before choosing APIs.
3. Pick the matching source docs from the table above.
4. Implement the smallest coherent schema change, keeping runtime schema and exported TypeScript type close enough to avoid drift.
5. If validation wraps external input, return or throw the project's existing error shape instead of leaking raw internals unless that is already the convention.
6. Run the repo's existing format/type/test checks when the task changes code.

## Zod Guidance

- Prefer schemas at trust boundaries: request params/body, environment variables, external API responses, persisted JSON, and form values.
- Prefer `safeParse` when the caller can handle validation failure locally; use `parse` when invalid input should throw into a central error path.
- Use `parseAsync` or `safeParseAsync` whenever refinements, transforms, or codecs perform async work.
- Use `z.output<typeof Schema>` or `z.input<typeof Schema>` instead of `z.infer` when transforms/codecs make input and output types differ.
- Do not replace TypeScript-only types with Zod unless runtime validation is actually needed.
- For large object schemas, prefer readable composition over deep inline schemas; keep refinements near the schema they constrain.
- For public errors, normalize Zod errors through the project's response or form-error helper.

## Updating This Skill

The bundled source docs were extracted from the GitHub docs directory. To refresh:

```powershell
pwsh .agents/skills/code-spec/zod/scripts/update-source-docs.ps1
```

Then review `references/source-docs/`, `references/doc-map.md`, `references/snapshot.json`, and this `SKILL.md` against upstream changes. If new major topics appear in `meta.json`, update the routing tables and the parent `code-spec` routing entry.
