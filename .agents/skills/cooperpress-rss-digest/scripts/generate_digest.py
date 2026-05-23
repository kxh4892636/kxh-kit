#!/usr/bin/env python3
from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import email.utils
import html
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path


@dataclasses.dataclass(frozen=True)
class FeedSpec:
    name: str
    locator: str
    is_file: bool = False


@dataclasses.dataclass
class DigestItem:
    source: str
    title: str
    link: str
    published: dt.datetime | None
    summary: str


@dataclasses.dataclass
class ArticleItem:
    source: str
    issue_title: str
    issue_link: str
    issue_date: dt.datetime | None
    section: str
    title: str
    link: str
    summary: str
    author: str
    is_sponsor: bool = False


DEFAULT_FEEDS = [
    FeedSpec("JavaScript Weekly", "https://javascriptweekly.com/rss/"),
    FeedSpec("Frontend Focus", "https://frontendfoc.us/rss/"),
    FeedSpec("Node Weekly", "https://nodeweekly.com/rss/"),
    FeedSpec("Golang Weekly", "https://golangweekly.com/rss/"),
    FeedSpec("React Status", "https://react.statuscode.com/rss/"),
    FeedSpec("Postgres Weekly", "https://postgresweekly.com/rss/"),
]


VOID_TAGS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}


class HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"br", "p", "li", "tr", "div"}:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        return " ".join("".join(self.parts).split())


@dataclasses.dataclass
class HtmlNode:
    tag: str
    attrs: dict[str, str]
    children: list["HtmlNode | str"]


class HTMLTreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = HtmlNode("document", {}, [])
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized_tag = tag.lower()
        node = HtmlNode(normalized_tag, {key.lower(): value or "" for key, value in attrs}, [])
        self.stack[-1].children.append(node)
        if normalized_tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_endtag(self, tag: str) -> None:
        normalized_tag = tag.lower()
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == normalized_tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        if data:
            self.stack[-1].children.append(data)


def strip_ns(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def child_text(element: ET.Element, names: set[str]) -> str:
    for child in list(element):
        if strip_ns(child.tag) in names:
            return "".join(child.itertext()).strip()
    return ""


def atom_link(element: ET.Element) -> str:
    for child in list(element):
        if strip_ns(child.tag) == "link":
            rel = child.attrib.get("rel", "alternate")
            href = child.attrib.get("href", "")
            if href and rel == "alternate":
                return href.strip()
    return ""


def html_to_text(value: str) -> str:
    value = html.unescape(value or "")
    parser = HTMLTextExtractor()
    parser.feed(value)
    return parser.text()


def clip_text(value: str, limit: int) -> str:
    value = " ".join((value or "").split())
    if len(value) <= limit:
        return value
    clipped = value[:limit].rsplit(" ", 1)[0].rstrip(".,;: ")
    return f"{clipped}..."


def parse_date(value: str) -> dt.datetime | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=dt.timezone.utc)
        return parsed
    except (TypeError, ValueError):
        pass
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = dt.datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=dt.timezone.utc)
        return parsed
    except ValueError:
        return None


def parse_name_value(value: str, option_name: str) -> tuple[str, str]:
    if "=" not in value:
        raise argparse.ArgumentTypeError(f"{option_name} must use NAME=VALUE format")
    name, locator = value.split("=", 1)
    name = name.strip()
    locator = locator.strip()
    if not name or not locator:
        raise argparse.ArgumentTypeError(f"{option_name} must include both NAME and VALUE")
    return name, locator


def fetch_feed(feed: FeedSpec, timeout: float) -> bytes:
    if feed.is_file:
        return Path(feed.locator).read_bytes()
    return fetch_url(feed.locator, timeout)


def fetch_url(url: str, timeout: float) -> bytes:
    last_error: Exception | None = None
    for attempt in range(3):
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "cooperpress-rss-digest/1.0 (+https://cooperpress.com/publications/)",
                "Accept": "text/html, application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except (OSError, TimeoutError, urllib.error.URLError) as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(1.0 + attempt)
    if last_error:
        raise last_error
    raise RuntimeError(f"Unable to fetch {url}")


def parse_feed_items(feed: FeedSpec, raw_xml: bytes, summary_chars: int, max_items: int) -> list[DigestItem]:
    root = ET.fromstring(raw_xml)
    root_name = strip_ns(root.tag)

    if root_name == "rss":
        channel = next((child for child in list(root) if strip_ns(child.tag) == "channel"), root)
        raw_items = [child for child in list(channel) if strip_ns(child.tag) == "item"]
        items = []
        for item in raw_items:
            title = child_text(item, {"title"}) or "(untitled)"
            link = child_text(item, {"link", "guid"})
            published = parse_date(child_text(item, {"pubDate", "published", "updated", "date"}))
            raw_summary = child_text(item, {"description", "encoded", "summary", "content"})
            summary = clip_text(html_to_text(raw_summary), summary_chars)
            items.append(DigestItem(feed.name, title, link, published, summary))
    elif root_name == "feed":
        raw_items = [child for child in list(root) if strip_ns(child.tag) == "entry"]
        items = []
        for item in raw_items:
            title = child_text(item, {"title"}) or "(untitled)"
            link = atom_link(item) or child_text(item, {"id"})
            published = parse_date(child_text(item, {"published", "updated"}))
            raw_summary = child_text(item, {"summary", "content"})
            summary = clip_text(html_to_text(raw_summary), summary_chars)
            items.append(DigestItem(feed.name, title, link, published, summary))
    else:
        raise ValueError(f"Unsupported feed root: {root_name}")

    items.sort(key=lambda item: item.published or dt.datetime.min.replace(tzinfo=dt.timezone.utc), reverse=True)
    if max_items > 0:
        return items[:max_items]
    return items


def format_date(value: dt.datetime | None) -> str:
    if value is None:
        return "未知"
    return value.astimezone(dt.timezone.utc).strftime("%Y-%m-%d")


def markdown_link(title: str, link: str) -> str:
    title = title.replace("\n", " ").strip()
    if link:
        return f"[{title}]({link})"
    return title


def parse_html(raw_html: bytes) -> HtmlNode:
    parser = HTMLTreeBuilder()
    parser.feed(raw_html.decode("utf-8", errors="replace"))
    return parser.root


def classes(node: HtmlNode) -> set[str]:
    return {part.strip() for part in node.attrs.get("class", "").split() if part.strip()}


def node_text(node: HtmlNode | str) -> str:
    if isinstance(node, str):
        return node
    if node.tag in {"script", "style"}:
        return ""
    return " ".join("".join(node_text(child) for child in node.children).split())


def find_all(node: HtmlNode, predicate) -> list[HtmlNode]:
    matches: list[HtmlNode] = []
    if predicate(node):
        matches.append(node)
    for child in node.children:
        if isinstance(child, HtmlNode):
            matches.extend(find_all(child, predicate))
    return matches


def first_node(node: HtmlNode, predicate) -> HtmlNode | None:
    if predicate(node):
        return node
    for child in node.children:
        if isinstance(child, HtmlNode):
            found = first_node(child, predicate)
            if found:
                return found
    return None


def article_links(node: HtmlNode, issue_link: str) -> list[tuple[str, str]]:
    links: list[tuple[str, str]] = []
    for anchor in find_all(node, lambda candidate: candidate.tag == "a" and bool(candidate.attrs.get("href"))):
        title = node_text(anchor).strip()
        href = anchor.attrs.get("href", "").strip()
        if not title or href.startswith(("#", "mailto:", "tel:")):
            continue
        if title.lower() in {"read on the web", "archives", "latest", "rss", "prev", "next"}:
            continue
        links.append((title, urllib.parse.urljoin(issue_link, href)))
    return links


def clean_section(value: str) -> str:
    value = " ".join(value.split())
    value = value.strip(" -—:|")
    return value or "未分栏"


def clean_summary(text: str, title: str) -> str:
    text = " ".join(text.split())
    if not text:
        return ""
    if title and title in text:
        text = text.replace(title, "", 1)
    text = text.lstrip(" —–-:：")
    return clip_text(text, 260)


def split_release_links(paragraph: HtmlNode, issue_link: str) -> list[tuple[str, str]]:
    text = node_text(paragraph)
    links = article_links(paragraph, issue_link)
    if len(links) <= 1:
        return links
    dash_index = min([index for index in (text.find(" – "), text.find(" — ")) if index >= 0] or [-1])
    if dash_index < 0:
        return links
    before_dash = text[:dash_index]
    return [link for link in links if link[0] in before_dash] or links[:1]


def extract_item_article(table: HtmlNode, issue: DigestItem) -> ArticleItem | None:
    desc = first_node(table, lambda node: node.tag == "p" and "desc" in classes(node))
    if not desc:
        return None
    main_link_container = first_node(desc, lambda node: "mainlink" in classes(node))
    links = article_links(main_link_container or desc, issue.link)
    if not links:
        return None

    title, link = links[0]
    name_node = first_node(table, lambda node: node.tag == "p" and "name" in classes(node))
    author = node_text(name_node).replace("sponsor", "").strip() if name_node else ""
    is_sponsor = "sponsor" in node_text(name_node).lower() if name_node else False

    return ArticleItem(
        source=issue.source,
        issue_title=issue.title,
        issue_link=issue.link,
        issue_date=issue.published,
        section="主条目",
        title=title,
        link=link,
        summary=clean_summary(node_text(desc), title),
        author=author,
        is_sponsor=is_sponsor,
    )


def extract_content_articles(table: HtmlNode, issue: DigestItem, section: str) -> list[ArticleItem]:
    table_classes = classes(table)
    release_like = "releases" in table_classes or "release" in section.lower()
    articles: list[ArticleItem] = []
    for paragraph in find_all(table, lambda node: node.tag == "p"):
        text = node_text(paragraph)
        if not text or text.isupper() and len(text) < 40:
            continue
        links = split_release_links(paragraph, issue.link) if release_like else article_links(paragraph, issue.link)[:1]
        if not links:
            continue
        for title, link in links:
            articles.append(
                ArticleItem(
                    source=issue.source,
                    issue_title=issue.title,
                    issue_link=issue.link,
                    issue_date=issue.published,
                    section=section,
                    title=title,
                    link=link,
                    summary=clean_summary(text, title),
                    author="",
                    is_sponsor="sponsor" in text.lower(),
                )
            )
    return articles


def parse_issue_articles(issue: DigestItem, raw_html: bytes) -> list[ArticleItem]:
    root = parse_html(raw_html)
    content = first_node(root, lambda node: node.tag == "div" and node.attrs.get("id") == "content")
    if not content:
        return []

    articles: list[ArticleItem] = []
    current_section = "主条目"
    seen: set[tuple[str, str]] = set()

    def add(article: ArticleItem | None) -> None:
        if not article:
            return
        key = (article.title, article.link)
        if key in seen:
            return
        seen.add(key)
        articles.append(article)

    def walk(node: HtmlNode, section: str) -> str:
        nonlocal current_section
        node_classes = classes(node)

        if node.tag == "table" and "el-heading" in node_classes:
            current_section = clean_section(node_text(node))
            return current_section

        if node.tag == "table" and "classifieds" in node_classes:
            saved_section = current_section
            current_section = "Classifieds"
            for article in extract_content_articles(node, issue, current_section):
                add(article)
            current_section = saved_section
            return current_section

        if node.tag == "table" and {"el-item", "item"}.issubset(node_classes):
            article = extract_item_article(node, issue)
            if article:
                article.section = current_section
            add(article)
            return current_section

        if node.tag == "table" and "content" in node_classes:
            section = current_section
            first_paragraph = first_node(node, lambda candidate: candidate.tag == "p")
            first_text = node_text(first_paragraph).strip() if first_paragraph else ""
            if first_text.upper() in {"IN BRIEF:", "RELEASES:"}:
                section = first_text.rstrip(":").title()
                current_section = section
            for article in extract_content_articles(node, issue, section):
                add(article)
            return current_section

        for child in node.children:
            if isinstance(child, HtmlNode):
                walk(child, current_section)
        return current_section

    walk(content, current_section)
    return articles


def render_markdown(
    items: list[DigestItem],
    statuses: list[dict[str, str | int]],
    since_days: int | None,
    max_items_per_feed: int,
    articles: list[ArticleItem] | None = None,
) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    articles = articles or []
    if articles:
        return render_articles_markdown(articles, statuses, since_days, max_items_per_feed, now)

    grouped: dict[str, list[DigestItem]] = defaultdict(list)
    for item in items:
        grouped[item.source].append(item)

    lines: list[str] = [
        "# Cooperpress 技术周刊 RSS 原始内容",
        "",
        "## 元信息",
        "",
        f"- 生成时间: {now.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        "- 数据源: Cooperpress RSS feeds, Ruby Weekly excluded",
        "- 分类状态: 未分类；由模型根据标题和摘要进行内容类型划分",
        f"- 每个 feed 最大条数: {'不限' if max_items_per_feed <= 0 else max_items_per_feed}",
        f"- 时间范围: 最近 {since_days} 天" if since_days else "- 时间范围: 未限制",
        f"- 收录条目: {len(items)}",
        "",
        "## RSS 条目",
        "",
    ]

    rendered_sources = [status["name"] for status in statuses if grouped.get(str(status["name"]))]
    rendered_sources.extend(sorted(source for source in grouped if source not in rendered_sources))

    if not rendered_sources:
        lines.extend(["暂无可用 RSS 条目。", ""])
    else:
        for source in rendered_sources:
            lines.extend([f"### {source}", ""])
            for item in grouped[str(source)]:
                lines.append(f"- {markdown_link(item.title, item.link)}")
                lines.append(f"  - 发布日期: {format_date(item.published)}")
                if item.summary:
                    lines.append(f"  - 摘要: {item.summary}")
            lines.append("")

    lines.extend(["## 抓取状态", ""])
    for status in statuses:
        if status["status"] == "ok":
            lines.append(f"- {status['name']}: 成功, {status['count']} 条")
        else:
            lines.append(f"- {status['name']}: 失败, {status['error']}")
    lines.append("")
    return "\n".join(lines)


def render_articles_markdown(
    articles: list[ArticleItem],
    statuses: list[dict[str, str | int]],
    since_days: int | None,
    max_items_per_feed: int,
    now: dt.datetime,
) -> str:
    grouped: dict[tuple[str, str, str], list[ArticleItem]] = defaultdict(list)
    for article in articles:
        grouped[(article.source, article.issue_title, article.issue_link)].append(article)

    lines: list[str] = [
        "# Cooperpress 技术周刊文章原始内容",
        "",
        "## 元信息",
        "",
        f"- 生成时间: {now.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        "- 数据源: Cooperpress RSS feeds, Ruby Weekly excluded",
        "- 内容层级: issue 内部文章级",
        "- 分类状态: 未分类；由模型根据标题和摘要进行内容类型划分",
        f"- 每个 feed 最大 issue 数: {'不限' if max_items_per_feed <= 0 else max_items_per_feed}",
        f"- 时间范围: 最近 {since_days} 天" if since_days else "- 时间范围: 未限制",
        f"- 收录文章: {len(articles)}",
        "",
        "## 文章条目",
        "",
    ]

    status_order = [str(status["name"]) for status in statuses]
    sorted_groups = sorted(
        grouped.items(),
        key=lambda group: (
            status_order.index(group[0][0]) if group[0][0] in status_order else len(status_order),
            group[0][1],
        ),
    )
    for (source, issue_title, issue_link), issue_articles in sorted_groups:
        lines.extend([f"### {source} - {markdown_link(issue_title, issue_link)}", ""])
        section_groups: dict[str, list[ArticleItem]] = defaultdict(list)
        for article in issue_articles:
            section_groups[article.section].append(article)
        for section, section_articles in section_groups.items():
            lines.extend([f"#### {section}", ""])
            for article in section_articles:
                sponsor_note = " sponsor" if article.is_sponsor else ""
                lines.append(f"- {markdown_link(article.title, article.link)}")
                lines.append(f"  - 发布日期: {format_date(article.issue_date)}; 来源: {article.source}{sponsor_note}")
                if article.author:
                    lines.append(f"  - 作者/机构: {article.author}")
                if article.summary:
                    lines.append(f"  - 摘要: {article.summary}")
            lines.append("")

    lines.extend(["## 抓取状态", ""])
    for status in statuses:
        if status["status"] == "ok":
            article_count = status.get("article_count")
            if article_count is None:
                lines.append(f"- {status['name']}: 成功, {status['count']} 个 issue")
            else:
                lines.append(f"- {status['name']}: 成功, {status['count']} 个 issue, {article_count} 篇文章")
            if status.get("issue_errors"):
                lines.append(f"  - issue 抓取失败: {status['issue_errors']}")
        else:
            lines.append(f"- {status['name']}: 失败, {status['error']}")
    lines.append("")
    return "\n".join(lines)


def build_feeds(args: argparse.Namespace) -> list[FeedSpec]:
    feeds: list[FeedSpec] = [] if args.no_default_feeds else list(DEFAULT_FEEDS)

    for raw in args.feed or []:
        name, url = parse_name_value(raw, "--feed")
        feeds.append(FeedSpec(name, url))

    for raw in args.feed_file or []:
        name, path = parse_name_value(raw, "--feed-file")
        feeds.append(FeedSpec(name, path, is_file=True))

    return feeds


def filter_since(items: list[DigestItem], since_days: int) -> list[DigestItem]:
    if since_days <= 0:
        return items
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=since_days)
    return [item for item in items if item.published is None or item.published >= cutoff]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a Markdown digest from Cooperpress RSS feeds.")
    parser.add_argument("--output", help="Markdown output path. Defaults to cooperpress-weekly-digest-YYYY-MM-DD.md")
    parser.add_argument("--max-items-per-feed", type=int, default=1, help="Maximum RSS items per feed. Defaults to 1; use 0 for unlimited.")
    parser.add_argument("--since-days", type=int, default=7, help="Only include items published within the last N days. Defaults to 7; use 0 for unlimited.")
    parser.add_argument("--timeout", type=float, default=20.0, help="Network timeout in seconds.")
    parser.add_argument("--summary-chars", type=int, default=240, help="Maximum summary characters per item.")
    parser.add_argument("--feed", action="append", help="Add a custom RSS/Atom feed as NAME=URL.")
    parser.add_argument("--feed-file", action="append", help="Read a local RSS/Atom XML file as NAME=PATH.")
    parser.add_argument("--no-default-feeds", action="store_true", help="Do not include the default Cooperpress feeds.")
    parser.add_argument("--expand-issues", action="store_true", help="Fetch each RSS issue URL and extract its internal article entries.")
    parser.add_argument("--print", action="store_true", dest="print_output", help="Print Markdown to stdout as well.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    feeds = build_feeds(args)
    if not feeds:
        print("No feeds configured. Use default feeds or pass --feed/--feed-file.", file=sys.stderr)
        return 2

    all_items: list[DigestItem] = []
    all_articles: list[ArticleItem] = []
    statuses: list[dict[str, str | int]] = []

    for feed in feeds:
        try:
            raw_xml = fetch_feed(feed, args.timeout)
            items = parse_feed_items(feed, raw_xml, args.summary_chars, args.max_items_per_feed)
            items = filter_since(items, args.since_days)
            all_items.extend(items)
            article_count = 0
            issue_errors: list[str] = []
            if args.expand_issues:
                for item in items:
                    if not item.link:
                        continue
                    try:
                        raw_html = fetch_url(item.link, args.timeout)
                        articles = parse_issue_articles(item, raw_html)
                        article_count += len(articles)
                        all_articles.extend(articles)
                    except (OSError, ValueError, urllib.error.URLError) as exc:
                        issue_errors.append(f"{item.link}: {exc}")
            status: dict[str, str | int] = {"name": feed.name, "status": "ok", "count": len(items)}
            if args.expand_issues:
                status["article_count"] = article_count
                if issue_errors:
                    status["issue_errors"] = " | ".join(issue_errors)
            statuses.append(status)
        except (OSError, ET.ParseError, ValueError, urllib.error.URLError) as exc:
            statuses.append({"name": feed.name, "status": "failed", "error": str(exc)})

    all_items.sort(key=lambda item: item.published or dt.datetime.min.replace(tzinfo=dt.timezone.utc), reverse=True)
    all_articles.sort(
        key=lambda item: (item.issue_date or dt.datetime.min.replace(tzinfo=dt.timezone.utc), item.source, item.section),
        reverse=True,
    )
    markdown = render_markdown(all_items, statuses, args.since_days, args.max_items_per_feed, all_articles)

    output = Path(args.output) if args.output else Path(f"cooperpress-weekly-digest-{dt.date.today().isoformat()}.md")
    output.write_text(markdown, encoding="utf-8")

    if args.print_output:
        print(markdown)
    else:
        print(f"Wrote {output}")

    ok_count = sum(1 for status in statuses if status["status"] == "ok")
    return 0 if ok_count else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
