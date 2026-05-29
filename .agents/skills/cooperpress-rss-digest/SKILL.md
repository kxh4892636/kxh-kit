---
name: cooperpress-rss-digest
description: 获取最近 7 天 Cooperpress 技术周刊 RSS，只筛选每个源最近 7 天内最新 1 个 issue，进入 issue 页面提取内部文章级条目，并合并不同 weekly 中重复出现的相同条目；同时读取 GitHub weekly trending 仓库及其 README 摘录，并由模型根据本次内容动态分类整理成 Markdown 文档，最终条目只输出标题链接和中文摘要，不输出来源、Issue、发布日期或仓库事实字段。凡是用户要求抓取 JavaScript Weekly、Frontend Focus、Node Weekly、Golang Weekly、React Status、Postgres Weekly、Cooperpress weekly feeds、RSS 周刊内容、技术周刊摘要、内部文章、issue 内所有文章、GitHub Trending 周热门仓库、或要求“排除 Ruby Weekly 后生成 Markdown/周报/摘要”时，都应使用本 skill。脚本只负责获取 RSS、issue 内文章条目、合并跨 weekly 重复条目、GitHub Trending 仓库和 README 摘录，不做分类、不翻译；分类和中文摘要由模型根据标题、摘要和 README 临场处理。默认使用 RSS 发现最近 7 天内每个源最新 1 个 issue，然后抓 issue 页面，不抓 Ruby Weekly。
---

# Cooperpress RSS Digest

本 skill 用于把 Cooperpress 系列技术周刊和 GitHub 周热门仓库转成一份按内容动态分类的 Markdown。默认用 RSS 发现最近 7 天 issue，每个源只取最新 1 个 issue，再抓取 issue 页面中的内部文章级条目，并把不同 weekly 中重复出现的相同条目合并为一条；同时读取 `https://github.com/trending?since=weekly` 中的周热门仓库并抓取各仓库 README 摘录。Cooperpress 数据源来自前面对话确认的 RSS 清单，并排除 Ruby Weekly：

- JavaScript Weekly: `https://javascriptweekly.com/rss/`
- Frontend Focus: `https://frontendfoc.us/rss/`
- Node Weekly: `https://nodeweekly.com/rss/`
- Golang Weekly: `https://golangweekly.com/rss/`
- React Status: `https://react.statuscode.com/rss/`
- Postgres Weekly: `https://postgresweekly.com/rss/`
- GitHub Trending Weekly: `https://github.com/trending?since=weekly`

## 工作流

1. 优先运行 bundled script 获取 RSS、issue 内部文章级条目、GitHub Trending 仓库和 README 摘录，而不是手写 RSS/HTML/GitHub 解析逻辑：

   ```bash
   python .agents/skills/cooperpress-rss-digest/scripts/generate_digest.py --since-days 7 --max-items-per-feed 1 --expand-issues --include-github-trending --output /tmp/cooperpress-articles-raw.md
   ```

2. 如果用户给了最终 Markdown 输出路径，先把脚本原始产物写到 `/tmp/cooperpress-articles-raw.md`，再由模型整理并写入用户路径。用户没有给路径时，最终文档输出到当前目录的 `cooperpress-weekly-digest-YYYY-MM-DD.md`。

3. 默认时间范围是最近 7 天，且每个源只取最新 1 个 issue。如果用户要求其他时间范围，使用 `--since-days <N>`；如果用户明确要求不限时间，使用 `--since-days 0`；如果用户要求控制 issue 数量，使用 `--max-items-per-feed <N>`。

4. 脚本会先按规范化 URL 合并重复文章；如果不同 weekly 使用不同跳转链接但标题规范化后相同，也合并为一条，并在条目中输出 `合并来源:`，列出所有来源 weekly、issue 和栏目。模型整理最终 Markdown 时，如果仍能明显判断为同一条内容，也应继续合并，不要在不同分类或来源下重复输出。

5. 读取脚本生成的原始 Markdown，根据本次文章条目的标题、摘要、来源、栏目、链接，以及 GitHub Trending 仓库描述和 README 摘录临场判断内容主题，生成最终的分类 Markdown。脚本不做分类，skill 也不预设固定分类标准；分类名称、数量和顺序都由当次内容决定。

   - `## 内容分类` 必须包含本次抓到的全部去重后文章条目，以及全部 GitHub Trending 仓库条目。
   - 不要再额外输出 `## 完整文章索引`、`## 完整文章条目`、`## 原始条目`、`## 文章索引` 等二次列表来补全遗漏。
   - 如果某条内容难以归类，也要放入一个自然生成的兜底分类，而不是移到索引区。

6. 生成最终 Markdown 时，内容分类里的每个条目只保留标题链接和 `摘要:`。不要在最终条目中输出来源、Issue、发布日期、合并来源、作者/机构、仓库语言、Stars、Forks、本周新增 Stars、README 链接等事实字段；这些字段只作为模型理解、去重和写摘要的依据。所有 `摘要:` 内容必须由模型翻译或改写为中文。GitHub Trending 章节也按相同方式呈现：保留仓库名链接，并为每个仓库写中文摘要。标题、链接、仓库名可以保留原文；不要留下整句英文摘要。

   - 不要编写翻译脚本、映射表、规则替换或调用本地/在线翻译程序来生成中文摘要。
   - 可以用脚本抓取 RSS、issue 页面、GitHub Trending 和 README、结构化条目；翻译和摘要压缩必须由当前模型完成。

7. 如果网络被沙箱阻断，按当前环境的审批规则请求网络权限。不要改用归档页抓取来绕过 RSS，除非用户明确要求。

8. 生成后快速检查 Markdown：
   - 标题、生成时间、RSS 源和 issue 抓取状态存在；
   - Ruby Weekly 不在数据源中；
   - GitHub Trending 章节存在，且仓库摘要依据 README 摘录由模型生成；
   - 跨 weekly 重复文章已合并，且最终文档中只输出合并后的一个条目；
   - `## 内容分类` 覆盖全部去重后文章和 GitHub Trending 仓库，且不输出空分类；
   - 不存在 `## 完整文章索引`、`## 完整文章条目`、`## 原始条目` 等二次补全章节；
   - 内容分类中的每个条目只包含标题链接和中文摘要，不包含来源、issue、发布日期、仓库信息或其他事实字段；
   - 所有摘要为中文，不保留整句英文摘要；
   - 抓取失败的源或 issue 记录在“抓取状态”里，不让单个 issue 失败中断整体输出。

## 输出结构

脚本生成的文章级原始 Markdown 使用以下结构：

```markdown
# Cooperpress 技术周刊文章原始内容

## 元信息

## 文章条目

### JavaScript Weekly - [issue title](issue url)

#### <issue 内栏目>

- [文章标题](文章链接)
  - 发布日期: <YYYY-MM-DD>; 来源: <RSS 来源>
  - 作者/机构: <作者或机构>
  - 合并来源: <RSS 来源> / <issue 标题> / <issue 内栏目>; <另一个 RSS 来源> / <issue 标题> / <issue 内栏目>
  - 摘要: <issue 页面摘要>

...

## GitHub Trending 仓库

- [#1 owner/repo](repo url)
  - 仓库信息: 语言: <language>; Stars: <stars>; Forks: <forks>; 本周新增 Stars: <stars this week>
  - 项目描述: <GitHub Trending 描述>
  - README: [README](README url)
  - README 摘录: <README 原文摘录>

## 抓取状态
```

模型整理后的最终 Markdown 使用以下结构。`<动态分类>` 由模型根据当次内容生成，不要使用固定清单，也不要为了覆盖预设领域而输出空分类：

```markdown
# Cooperpress 技术周刊摘要

## 元信息

## 内容分类

### <动态分类 1>

- [条目标题](链接)
  - 摘要: <中文摘要>

### <动态分类 2>

...

### <GitHub Trending 相关动态分类>

- [owner/repo](repo url)
  - 摘要: <根据 GitHub 描述和 README 摘录生成的中文摘要>

## 抓取状态
```

分类时优先让主题对读者有用，而不是贴近 RSS 来源。可以把不同来源中主题相近的条目合并到同一类；也可以把同一来源的多条内容拆到不同类。分类数量以内容自然聚合为准，通常 3-8 个分类足够；如果条目很多，可以超过 8 个分类，但不能用“完整文章索引”替代分类覆盖。

RSS 只用作 issue 发现入口；最终周刊内容应以 issue 页面内部文章级条目为准。GitHub Trending 内容应以 trending 页面给出的仓库事实字段和 README 摘录为准。

## 脚本命令

生成最近 7 天、每个 feed 最新 1 个 issue 的内部文章：

```bash
python .agents/skills/cooperpress-rss-digest/scripts/generate_digest.py \
  --since-days 7 \
  --expand-issues \
  --max-items-per-feed 1 \
  --include-github-trending \
  --output /tmp/cooperpress-articles-raw.md
```

只抓 GitHub Trending 周热门仓库并读取 README 摘录：

```bash
python .agents/skills/cooperpress-rss-digest/scripts/generate_digest.py \
  --no-default-feeds \
  --include-github-trending \
  --output /tmp/github-trending-raw.md
```

使用本地 RSS 文件做离线验证：

```bash
python .agents/skills/cooperpress-rss-digest/scripts/generate_digest.py \
  --no-default-feeds \
  --feed-file "JavaScript Weekly=/tmp/javascriptweekly.xml" \
  --output /tmp/cooperpress-rss-raw-offline.md
```

## 内容边界

- 只从公开 RSS 和公开 GitHub 页面/API 获取内容；不要登录邮箱或模拟订阅流程。
- 默认不要抓 Ruby Weekly。
- 默认只保留最近 7 天内容；只有用户明确要求时才扩大或取消时间范围。
- 默认每个 RSS 源只筛选最近 7 天内最新 1 个 issue；只有用户明确要求时才扩大 issue 数量。
- 默认通过 RSS 找 issue，再抓 issue 页面内部文章；不要抓 Cooperpress 归档列表页。
- 如果同一文章出现在多个 weekly 中，必须合并为一个最终条目；来源、issue、栏目和发布日期只用于判断重复，不要在最终文档里输出，也不要重复输出同一条内容。
- GitHub Trending 默认读取 weekly 页面中的周热门仓库，脚本抓 README 摘录作为模型生成中文摘要的依据；最终文档只保留仓库名链接和中文摘要，不输出仓库事实字段。
- 最终 Markdown 不输出完整文章索引；所有条目必须出现在内容分类里，包括 GitHub Trending 仓库。
- 不补造脚本层摘要；issue 页面没给摘要时，最终条目仍只保留标题链接和一个基于标题及可用上下文的简短中文摘要，不能补写未经依据支持的事实。
- 最终交付 Markdown 的摘要必须为中文；翻译和改写由模型完成，保留技术术语原文即可。
- 禁止把翻译逻辑写进脚本；脚本只负责抓取和结构化。
- 不把分类规则写进脚本，也不在 skill 中固定分类标准；分类判断留给模型基于当次内容完成。
