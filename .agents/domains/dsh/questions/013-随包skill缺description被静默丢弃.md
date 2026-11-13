---
name: '013-随包skill缺description被静默丢弃'
description: 'SKILL.md 的 frontmatter 缺 description 或写成空值，包内 provider 直接跳过该目录，没有任何报错，斜杠菜单和 skill 列表都不会出现它。'
---

# 013-随包skill缺description被静默丢弃

## 现象

在 `packages/dsh-toolkit/src/nano-flow/skills/<name>/SKILL.md` 新建了 skill，装包并刷新后斜杠菜单里没有它，日志与 `nano_flow_check` 也都不报错。

## 原因

包内 provider 逐个目录读 `SKILL.md`，调用 `parseSkillText`（`src/nested-skill/parse.ts`）：`name` 与 `description` 必须都是**非空字符串**，任一缺失就返回 `undefined`，provider 随即 `continue`。

`description:` 后面留空时，YAML 解析出的是 `null` 而不是字符串，于是整个 skill 被当成「不是 skill」。校验器只管领域文档，不管包内 skill 的 frontmatter，所以全程静默。

## 处理

- `description` 必填且非空，写清「什么时候用 + 做什么」。
- 只给人手调的 skill 再补 `disable-model-invocation: true` 与同目录 `agents/openai.yaml` 的 `policy.allow_implicit_invocation: false`；该字段只影响模型自动选择，不补也不会造成目录里「有文件却不出现」。
- 目录名必须等于 frontmatter 的 `name`，且是 kebab-case。

## 验证

`node --input-type=module -e "import {parse as p} from 'yaml'; console.log(p('name: x\ndescription:\n').description)"` → `null` 即会被丢弃。

装包后核对 `~/.dsh/profiles/<profile>/node_modules/@kxh4892636/dsh-toolkit/dist/nano-flow/skills/<name>/SKILL.md` 的 frontmatter 是否为非空 description。

## 相关

- [DSH 领域词表](../CONTEXT.md) — 随包 skill 目录、手调与自动选择的区分。
- [001-发布dsh-toolkit并真机验收](../workflows/001-发布dsh-toolkit并真机验收/001-发布dsh-toolkit并真机验收.md) — 装包后按 skill 列表走查才能发现缺项。
