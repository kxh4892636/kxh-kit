---
name: cooperpress-rss-digest
description: 获取最近 7 天 Cooperpress 技术周刊 RSS，只筛选每个源最近 7 天内最新 1 个 issue，进入 issue 页面提取内部文章级条目，并由模型根据本次内容动态分类整理成 Markdown 文档，摘要翻译为中文。凡是用户要求抓取 JavaScript Weekly、Frontend Focus、Node Weekly、Golang Weekly、React Status、Postgres Weekly、Cooperpress weekly feeds、RSS 周刊内容、技术周刊摘要、内部文章、issue 内所有文章、或要求“排除 Ruby Weekly 后生成 Markdown/周报/摘要”时，都应使用本 skill。脚本只负责获取 RSS 和 issue 内文章条目，不做分类、不翻译；分类和中文摘要由模型根据标题和摘要临场处理。默认只使用 RSS 发现最近 7 天内每个源最新 1 个 issue，然后抓 issue 页面，不抓 Ruby Weekly。
---

# Cooperpress RSS Digest

本 skill 用于把 Cooperpress 系列技术周刊转成一份按内容动态分类的 Markdown。默认用 RSS 发现最近 7 天 issue，每个源只取最新 1 个 issue，再抓取 issue 页面中的内部文章级条目；数据源来自前面对话确认的 RSS 清单，并排除 Ruby Weekly：

- JavaScript Weekly: `https://javascriptweekly.com/rss/`
- Frontend Focus: `https://frontendfoc.us/rss/`
- Node Weekly: `https://nodeweekly.com/rss/`
- Golang Weekly: `https://golangweekly.com/rss/`
- React Status: `https://react.statuscode.com/rss/`
- Postgres Weekly: `https://postgresweekly.com/rss/`

## 工作流

1. 优先运行 bundled script 获取 RSS 和 issue 内部文章级条目，而不是手写 RSS/HTML 解析逻辑：

   ```bash
   python .agents/skills/cooperpress-rss-digest/scripts/generate_digest.py --since-days 7 --max-items-per-feed 1 --expand-issues --output /tmp/cooperpress-articles-raw.md
   ```

2. 如果用户给了最终 Markdown 输出路径，先把脚本原始产物写到 `/tmp/cooperpress-articles-raw.md`，再由模型整理并写入用户路径。用户没有给路径时，最终文档输出到当前目录的 `cooperpress-weekly-digest-YYYY-MM-DD.md`。

3. 默认时间范围是最近 7 天，且每个源只取最新 1 个 issue。如果用户要求其他时间范围，使用 `--since-days <N>`；如果用户明确要求不限时间，使用 `--since-days 0`；如果用户要求控制 issue 数量，使用 `--max-items-per-feed <N>`。

4. 读取脚本生成的原始 Markdown，根据本次文章条目的标题、摘要、来源、栏目和链接临场判断内容主题，生成最终的分类 Markdown。脚本不做分类，skill 也不预设固定分类标准；分类名称、数量和顺序都由当次内容决定。

5. 生成最终 Markdown 时，所有 `摘要:` 内容必须由模型翻译或改写为中文。标题、链接、来源名、作者/机构名可以保留原文；不要留下整句英文摘要。

   - 不要编写翻译脚本、映射表、规则替换或调用本地/在线翻译程序来生成中文摘要。
   - 可以用脚本抓取 RSS 和 issue 页面、结构化文章条目；翻译和摘要压缩必须由当前模型完成。

6. 如果网络被沙箱阻断，按当前环境的审批规则请求网络权限。不要改用归档页抓取来绕过 RSS，除非用户明确要求。

7. 生成后快速检查 Markdown：
   - 标题、生成时间、RSS 源和 issue 抓取状态存在；
   - Ruby Weekly 不在数据源中；
   - 内容按当次主题分组，且不输出空分类；
   - 每篇文章包含来源、issue、发布日期和链接；
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
  - 摘要: <issue 页面摘要>

...

## 抓取状态
```

模型整理后的最终 Markdown 使用以下结构。`<动态分类>` 由模型根据当次内容生成，不要使用固定清单，也不要为了覆盖预设领域而输出空分类：

```markdown
# Cooperpress 技术周刊摘要

## 元信息

## 内容分类

### <动态分类 1>

- [条目标题](链接)
  - 来源: <RSS 来源>; Issue: <issue 标题>; 发布日期: <YYYY-MM-DD>
  - 摘要: <中文摘要>

### <动态分类 2>

...

## 抓取状态
```

分类时优先让主题对读者有用，而不是贴近 RSS 来源。可以把不同来源中主题相近的条目合并到同一类；也可以把同一来源的多条内容拆到不同类。分类数量以内容自然聚合为准，通常 3-8 个分类足够。

RSS 只用作 issue 发现入口；最终内容应以 issue 页面内部文章级条目为准。

## 脚本命令

生成最近 7 天、每个 feed 最新 1 个 issue 的内部文章：

```bash
python .agents/skills/cooperpress-rss-digest/scripts/generate_digest.py \
  --since-days 7 \
  --expand-issues \
  --max-items-per-feed 1 \
  --output /tmp/cooperpress-articles-raw.md
```

使用本地 RSS 文件做离线验证：

```bash
python .agents/skills/cooperpress-rss-digest/scripts/generate_digest.py \
  --no-default-feeds \
  --feed-file "JavaScript Weekly=/tmp/javascriptweekly.xml" \
  --output /tmp/cooperpress-rss-raw-offline.md
```

## 内容边界

- 只从公开 RSS 获取内容；不要登录邮箱或模拟订阅流程。
- 默认不要抓 Ruby Weekly。
- 默认只保留最近 7 天内容；只有用户明确要求时才扩大或取消时间范围。
- 默认每个 RSS 源只筛选最近 7 天内最新 1 个 issue；只有用户明确要求时才扩大 issue 数量。
- 默认通过 RSS 找 issue，再抓 issue 页面内部文章；不要抓 Cooperpress 归档列表页。
- 不补造脚本层摘要；issue 页面没给摘要时只保留标题、来源、issue、日期和链接。
- 最终交付 Markdown 的摘要必须为中文；翻译和改写由模型完成，保留技术术语原文即可。
- 禁止把翻译逻辑写进脚本；脚本只负责抓取和结构化。
- 不把分类规则写进脚本，也不在 skill 中固定分类标准；分类判断留给模型基于当次内容完成。
