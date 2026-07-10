# Learning Notes Basic Cards

Use this flow when the source is Markdown or wiki-style learning notes and the user wants Anki cards derived from note/chapter structure.

## When To Use

Use this flow for:

- Markdown learning notes under a directory such as `inbox/go`;
- One Markdown file per chapter;
- Notes with heading hierarchy (`H1`/`H2`/`H3`);
- Wiki-backed notes where the back field should link to the source note;
- Requests like "根据 markdown 笔记生成 Anki 卡片", "学习笔记生成卡片", "先给我知识点卡片划分".

## Required Inputs

Infer safely where possible, otherwise ask:

- Source path: directory or file list;
- Target root deck;
- Target child deck derivation rule;
- Note type;
- Front field format;
- Back field format;
- Link base, if cards should link to a wiki page.

Observed defaults from the captured workflow:

- Source path: `inbox/<topic>`;
- Note type: `基础`;
- Fields: `正面` and `背面`;
- Front format: `一级牌组-二级牌组-知识点`;
- Back format: `<a href="https://wiki.kongxiaohan.cn/<uuid>">跳转wiki</a>`;
- Child deck: Markdown filename after removing a numeric prefix and `.md`;
- `README.md` is treated as an index and excluded unless explicitly requested.

## Source Parsing

For Markdown chapter directories:

- Include chapter files matching patterns like `^\d{3}-.+\.md$`;
- Exclude `README.md` and other obvious indexes unless requested;
- Preserve source order by filename prefix;
- Read YAML frontmatter and extract `id` as the wiki UUID;
- Read headings and line numbers for preview.

Filename derivation:

```text
010-Go-入门.md -> Go-入门
020-模块-包-导入.md -> 模块-包-导入
```

## Deck Mapping

Use the target root deck plus one child deck per chapter:

```text
Root::Child
Go::Go-入门
Go::模块-包-导入
```

If a requested hierarchy is deeper than the available Anki workflow can create, explain the constraint and preview a supported fallback before creating anything.

## Card Front And Back

Front:

```text
一级牌组-二级牌组-知识点
```

Examples:

```text
Go-Go-入门-开发环境
Go-模块-包-导入-Module
```

Back:

```html
<a href="https://wiki.kongxiaohan.cn/b47d0197-c70e-40ba-be09-b924bfc80b18">跳转wiki</a>
```

Use the UUID from the corresponding Markdown file for every card derived from that file.

## Granularity Rules

Start with coarse, reviewable cards:

- Default boundary: one card per `H2` section;
- Merge related `H3` subsections under their parent `H2`;
- Do not split mechanical subheadings such as `概念`, `语法格式`, `命令`, `类型表`, `示例`, or `对比` when they support the same knowledge point;
- Prefer roughly 30-90 Markdown lines per card when possible;
- Allow slightly over 89 lines when the knowledge point is coherent and splitting would make the card worse;
- Split to `H3` or custom semantic groups only when an `H2` is too broad, too long, or mixes unrelated concepts.

Useful custom splits from the captured workflow:

- `函数` -> `函数声明与返回值`, `函数参数与内置函数`;
- `方法` -> `方法声明与接收者`, `方法调用与方法集合`, `方法类型嵌入`;
- `channel` -> `channel-基础与缓冲`, `channel-方向关闭与接收`;
- `共享数据同步` -> `同步工具与锁`, `WaitGroup 和 Once`, `atomic`.

## Mandatory Preview

Always output the preview before creating cards, even if the user already said "创建".

Preview format:

```markdown
| 章节 | 正面内容 | Markdown 行数 |
|---|---|---:|
| Go-入门 | Go-Go-入门-开发环境 | L31-L107，77 行 |
```

Preview must include:

- Total candidate card count;
- Excluded files;
- Target deck mapping;
- Note type and field format;
- Any cards exceeding the preferred line target and why they remain merged.

Stop after the preview and ask the user to confirm or request changes. Do not create cards during the same response that first shows the preview.

## Creation After Confirmation

Only after the user confirms the current preview:

1. Inspect the requested note type and field names with the available Anki workflow.
2. Inspect existing decks and create missing target decks with the available Anki workflow.
3. Create notes per child deck with the available Anki workflow.
4. Avoid duplicates unless the user explicitly requested duplicates.
5. Preserve HTML in the back field.
6. Verify created notes with the available Anki workflow.

Create exactly the cards from the confirmed preview. If anything changes, return to preview.

## Verification Summary

Final summary should report:

- Total notes created;
- Per-deck counts;
- Note type;
- Duplicate/skipped/failed counts;
- Verification result.

Example:

```text
已创建 Anki 卡片，共 57 张，全部使用 基础 模板。
验证结果：核对到 57 条目标笔记，创建 57、跳过 0、失败 0。
```
