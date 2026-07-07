---
name: antd
description: Ant Design / antd React 组件库专项参考。由 code-spec 按需读取，用于使用、修改、调试、评审或解释 Ant Design、antd、AntD、ConfigProvider、Form、Table、Modal、Select、DatePicker、Upload、Layout、主题 token、classNames/styles 语义化 DOM、组件 API 或中文官方文档。
---

# Ant Design

Use this reference for Ant Design React work. Prefer the local Chinese official documentation snapshots over memory for component APIs, examples, semantic DOM keys, design tokens, and migration-sensitive behavior.

## Source

- Official full Chinese docs: `https://ant.design/llms-full-cn.txt`
- Official semantic DOM docs: `https://ant.design/llms-semantic-cn.md`
- Fetched: 2026-05-31
- Component index: `references/component-map.md`
- Split component docs: `references/component-docs/`
- Semantic DOM index: `references/semantic-map.md`
- Split semantic DOM docs: `references/semantic-docs/`

The split component and semantic DOM docs are derived directly from the two upstream `llms` files for progressive disclosure. The downloaded `llms` source files are transient and are not retained after splitting.

## What Counts As Done

For Ant Design coding or review tasks, finish only after you have:

1. Confirmed the project actually uses `antd` and checked its installed version from `package.json` or the lockfile when behavior may be version-sensitive.
2. Read `references/component-map.md` and the relevant component docs before relying on component props, examples, or edge-case behavior.
3. Read `references/semantic-map.md` and the relevant split semantic doc when changing `classNames`, `styles`, semantic DOM slots, DOM-targeted tests, or component-specific styling hooks.
4. Matched the existing app's component-library choice, form strategy, date library, styling approach, and state/data-fetching conventions.
5. Ran the smallest useful verification available in the project, such as type check, unit test, story/example render, or the existing frontend check command.

## Workflow

1. Classify the request:
   - Component API or composition: Table, Form, Modal, Select, DatePicker, Upload, Menu, Layout, App, ConfigProvider, etc.
   - Theming: `ConfigProvider`, design tokens, algorithm, CSS variables, locale, prefixCls.
   - Forms: `Form`, `Form.Item`, validation rules, `Form.List`, controlled fields, dependencies.
   - Data display: `Table`, `List`, `Descriptions`, `Tree`, pagination, sorting, filtering, virtual list.
   - Feedback and overlay: Modal, Drawer, Popover, Tooltip, Message, Notification, App context.
   - Styling hooks: `classNames`, `styles`, semantic DOM names, component tokens.
2. Open `references/component-map.md` to locate the relevant component file under `references/component-docs/`.
3. Read only the needed component document first; search `references/component-docs/` when the split index is insufficient.
4. For semantic styling or DOM structure questions, open `references/semantic-map.md` and then the matching file under `references/semantic-docs/`. Search `references/semantic-docs/` for cross-entry semantic questions.
5. Adapt examples to the user's existing codebase. Do not introduce a second component library, date library, icon package, form abstraction, or styling system unless the repository already uses it or the user asks for it.

## Implementation Guidance

- Prefer official component props and documented composition patterns over manually reproducing Ant Design internals with `div`s.
- Use `App` / `App.useApp()` for message, notification, and modal context when the docs or existing project pattern requires it.
- Put global theme, locale, size, disabled state, and token customization in `ConfigProvider` instead of scattering ad hoc styles.
- For forms, keep `Form.Item` names, validation rules, `dependencies`, `shouldUpdate`, and controlled component wiring explicit; avoid duplicating form state outside Ant Design unless the project already does so.
- For tables, keep row identity stable with `rowKey`, make sorter/filter/pagination behavior explicit, and avoid expensive inline render work when the table is large.
- For custom styling, prefer documented `classNames` and `styles` semantic keys. Fall back to wrapper classes only when the semantic docs do not expose the needed slot.
- Preserve accessibility that Ant Design components provide by default. When wrapping components, keep labels, `aria-*`, keyboard interaction, focus management, and overlay containers intact.

## Reference Map

Start with these files:

| Need | Read |
| --- | --- |
| Component inventory and local file names | `references/component-map.md` |
| Individual component API and examples | `references/component-docs/components__<component>-cn.md` |
| Utility types such as `GetProps` and `GetRef` | `references/component-docs/components___util-cn.md` |
| Semantic DOM inventory and local file names | `references/semantic-map.md` |
| Semantic DOM slots and `classNames` / `styles` examples | `references/semantic-docs/components__<component>-cn__semantic*.md` |
| Broad component search | `references/component-docs/` |
| Broad semantic DOM search | `references/semantic-docs/` |

## Updating This Skill

Refresh only from the two official `llms` sources unless the user asks for additional pages:

1. Download `https://ant.design/llms-full-cn.txt` to a temporary file.
2. Download `https://ant.design/llms-semantic-cn.md` to a temporary file.
3. Regenerate `references/component-docs/` by splitting the temporary `llms-full-cn.txt` on top-level component sections whose source is `https://ant.design/components/*-cn.md`.
4. Regenerate `references/semantic-docs/` by splitting the temporary `llms-semantic-cn.md` on top-level semantic sections with a following `Source:` URL.
5. Regenerate `references/component-map.md` and `references/semantic-map.md` with names, source URLs, local split files, and file sizes.
6. Delete the temporary downloaded `llms` files after successful splitting.
7. Review the diff, preserve this local workflow guidance, and keep the parent `code-spec` routing entry aligned.
