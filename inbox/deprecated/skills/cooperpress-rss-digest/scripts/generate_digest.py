#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import dataclasses
import datetime as dt
import email.utils
import html
import json
import re
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
class ArticleOccurrence:
    source: str
    issue_title: str
    issue_link: str
    issue_date: dt.datetime | None
    section: str
    author: str
    is_sponsor: bool = False


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
    occurrences: list[ArticleOccurrence] = dataclasses.field(default_factory=list)


@dataclasses.dataclass
class TrendingRepo:
    rank: int
    owner: str
    repo: str
    name: str
    url: str
    description: str
    language: str
    stars: str
    forks: str
    stars_this_week: str
    readme_url: str
    readme_excerpt: str
    readme_error: str = ""


DEFAULT_FEEDS = [
    FeedSpec("JavaScript Weekly", "https://javascriptweekly.com/rss/"),
    FeedSpec("Frontend Focus", "https://frontendfoc.us/rss/"),
    FeedSpec("Node Weekly", "https://nodeweekly.com/rss/"),
    FeedSpec("Golang Weekly", "https://golangweekly.com/rss/"),
    FeedSpec("React Status", "https://react.statuscode.com/rss/"),
    FeedSpec("Postgres Weekly", "https://postgresweekly.com/rss/"),
]

DEFAULT_GITHUB_TRENDING_URL = "https://github.com/trending?since=weekly"


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


def unique_join(values: list[str], separator: str = ", ") -> str:
    seen: set[str] = set()
    unique_values: list[str] = []
    for value in values:
        value = " ".join((value or "").split())
        if not value or value in seen:
            continue
        seen.add(value)
        unique_values.append(value)
    return separator.join(unique_values)


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


def fetch_url(url: str, timeout: float, accept: str | None = None) -> bytes:
    last_error: Exception | None = None
    for attempt in range(3):
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "cooperpress-rss-digest/1.0 (+https://cooperpress.com/publications/)",
                "Accept": accept
                or "text/html, application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
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


def clean_inline(value: str) -> str:
    return " ".join((value or "").split())


def clean_number_text(value: str) -> str:
    return clean_inline(value).replace("\u00a0", " ")


def clean_readme(raw: bytes, limit: int) -> str:
    text = raw.decode("utf-8", errors="replace")
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.DOTALL)

    lines: list[str] = []
    in_fence = False
    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if stripped.startswith(("```", "~~~")):
            in_fence = not in_fence
            continue
        if in_fence or not stripped:
            continue
        lowered = stripped.lower()
        if lowered.startswith(("![", "<img")):
            continue
        if re.fullmatch(r"\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)", stripped):
            continue
        stripped = re.sub(r"\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)", "", stripped)
        stripped = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", stripped)
        stripped = re.sub(r"<[^>]+>", " ", stripped)
        stripped = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", stripped)
        stripped = re.sub(r"[*_`]+", "", stripped)
        stripped = stripped.lstrip("#> -*_`")
        stripped = clean_inline(html.unescape(stripped))
        if stripped:
            lines.append(stripped)

    return clip_text(" ".join(lines), limit)


def text_for_link(node: HtmlNode, href_suffix: str) -> str:
    for anchor in find_all(node, lambda candidate: candidate.tag == "a" and bool(candidate.attrs.get("href"))):
        href = anchor.attrs.get("href", "").rstrip("/")
        if href.endswith(href_suffix):
            return clean_number_text(node_text(anchor))
    return ""


def parse_trending_repo(article: HtmlNode, rank: int, base_url: str) -> TrendingRepo | None:
    heading = first_node(article, lambda node: node.tag == "h2")
    link_node = first_node(heading or article, lambda node: node.tag == "a" and bool(node.attrs.get("href")))
    if not link_node:
        return None

    href = link_node.attrs.get("href", "").strip()
    match = re.match(r"^/([^/\s]+)/([^/\s]+)$", href)
    if not match:
        return None

    owner, repo = match.group(1), match.group(2)
    name = f"{owner}/{repo}"
    description_node = first_node(article, lambda node: node.tag == "p")
    language_node = first_node(
        article,
        lambda node: node.tag == "span" and node.attrs.get("itemprop") == "programmingLanguage",
    )
    article_text = node_text(article)
    weekly_match = re.search(r"([\d,]+)\s+stars?\s+this\s+week", article_text, re.IGNORECASE)

    return TrendingRepo(
        rank=rank,
        owner=owner,
        repo=repo,
        name=name,
        url=urllib.parse.urljoin(base_url, href),
        description=clean_inline(node_text(description_node)) if description_node else "",
        language=clean_inline(node_text(language_node)) if language_node else "",
        stars=text_for_link(article, "/stargazers"),
        forks=text_for_link(article, "/forks"),
        stars_this_week=weekly_match.group(1) if weekly_match else "",
        readme_url="",
        readme_excerpt="",
    )


def parse_github_trending(raw_html: bytes, trending_url: str, max_repos: int) -> list[TrendingRepo]:
    root = parse_html(raw_html)
    articles = find_all(root, lambda node: node.tag == "article" and "Box-row" in classes(node))
    repos: list[TrendingRepo] = []
    for article in articles:
        repo = parse_trending_repo(article, len(repos) + 1, trending_url)
        if repo:
            repos.append(repo)
        if max_repos > 0 and len(repos) >= max_repos:
            break
    return repos


def decode_github_content(raw: bytes) -> tuple[str, bytes] | None:
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None

    download_url = payload.get("download_url")
    content = payload.get("content")
    if isinstance(content, str):
        try:
            return str(download_url or ""), base64.b64decode(content)
        except (ValueError, TypeError):
            return None
    return None


def fetch_repo_readme(repo: TrendingRepo, timeout: float, readme_chars: int) -> TrendingRepo:
    owner = urllib.parse.quote(repo.owner, safe="")
    name = urllib.parse.quote(repo.repo, safe="")
    api_url = f"https://api.github.com/repos/{owner}/{name}/readme"
    readme_errors: list[str] = []

    try:
        raw = fetch_url(
            api_url,
            timeout,
            accept="application/vnd.github.raw, application/vnd.github.v3.raw, application/json;q=0.9, */*;q=0.1",
        )
        if raw.lstrip().startswith(b"{"):
            decoded = decode_github_content(raw)
            if not decoded:
                raise ValueError("GitHub API returned JSON without README content")
            repo.readme_url, raw = decoded
        else:
            repo.readme_url = f"{repo.url}#readme"
        repo.readme_excerpt = clean_readme(raw, readme_chars)
        if repo.readme_excerpt:
            return repo
    except (OSError, ValueError, urllib.error.URLError) as exc:
        readme_errors.append(f"GitHub API: {exc}")

    for filename in ("README.md", "readme.md", "README.MD", "README.rst", "README.txt"):
        raw_url = f"https://raw.githubusercontent.com/{owner}/{name}/HEAD/{filename}"
        try:
            raw = fetch_url(raw_url, timeout, accept="text/plain, text/markdown, */*;q=0.1")
            repo.readme_url = raw_url
            repo.readme_excerpt = clean_readme(raw, readme_chars)
            if repo.readme_excerpt:
                return repo
        except (OSError, ValueError, urllib.error.URLError) as exc:
            readme_errors.append(f"{filename}: {exc}")

    repo.readme_error = " | ".join(readme_errors)
    return repo


def fetch_github_trending(
    trending_url: str,
    timeout: float,
    max_repos: int,
    readme_chars: int,
) -> tuple[list[TrendingRepo], dict[str, str | int]]:
    try:
        raw_html = fetch_url(trending_url, timeout)
        repos = parse_github_trending(raw_html, trending_url, max_repos)
        if not repos:
            raise ValueError("No GitHub Trending repositories parsed")
        for repo in repos:
            fetch_repo_readme(repo, timeout, readme_chars)
        return repos, {
            "name": "GitHub Trending",
            "status": "ok",
            "count": len(repos),
            "readme_count": sum(1 for repo in repos if repo.readme_excerpt),
        }
    except (OSError, ValueError, urllib.error.URLError) as exc:
        return [], {"name": "GitHub Trending", "status": "failed", "error": str(exc)}


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


def normalized_article_url(url: str) -> str:
    if not url:
        return ""
    parsed = urllib.parse.urlparse(url)
    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path = re.sub(r"/+$", "", parsed.path)
    return urllib.parse.urlunparse((parsed.scheme.lower(), netloc, path, "", "", ""))


def normalized_article_title(title: str) -> str:
    title = html.unescape(title or "").lower()
    title = re.sub(r"['’`]", "", title)
    title = re.sub(r"[^a-z0-9]+", " ", title)
    return " ".join(title.split())


def article_duplicate_keys(article: ArticleItem) -> list[tuple[str, str]]:
    keys: list[tuple[str, str]] = []
    url_key = normalized_article_url(article.link)
    if url_key:
        keys.append(("url", url_key))

    title_key = normalized_article_title(article.title)
    if len(title_key) >= 3:
        keys.append(("title", title_key))
    return keys


def article_occurrence(article: ArticleItem) -> ArticleOccurrence:
    return ArticleOccurrence(
        source=article.source,
        issue_title=article.issue_title,
        issue_link=article.issue_link,
        issue_date=article.issue_date,
        section=article.section,
        author=article.author,
        is_sponsor=article.is_sponsor,
    )


def article_occurrences(article: ArticleItem) -> list[ArticleOccurrence]:
    return article.occurrences or [article_occurrence(article)]


def merge_article(base: ArticleItem, duplicate: ArticleItem) -> None:
    if not base.occurrences:
        base.occurrences = [article_occurrence(base)]
    base.occurrences.extend(article_occurrences(duplicate))

    if not base.summary and duplicate.summary:
        base.summary = duplicate.summary
    elif duplicate.summary and duplicate.summary not in base.summary:
        base.summary = clip_text(f"{base.summary} {duplicate.summary}", 360)

    if not base.author and duplicate.author:
        base.author = duplicate.author
    elif duplicate.author and duplicate.author not in base.author:
        base.author = unique_join([base.author, duplicate.author])

    base.is_sponsor = base.is_sponsor or duplicate.is_sponsor


def merge_duplicate_articles(articles: list[ArticleItem]) -> list[ArticleItem]:
    merged: list[ArticleItem] = []
    index: dict[tuple[str, str], ArticleItem] = {}

    for article in articles:
        keys = article_duplicate_keys(article)
        existing = next((index[key] for key in keys if key in index), None)
        if existing:
            merge_article(existing, article)
            for key in keys:
                index.setdefault(key, existing)
            continue

        article.occurrences = [article_occurrence(article)]
        merged.append(article)
        for key in keys:
            index.setdefault(key, article)

    return merged


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


def append_github_trending_markdown(lines: list[str], repos: list[TrendingRepo]) -> None:
    if not repos:
        return

    lines.extend(["## GitHub Trending 仓库", ""])
    for repo in repos:
        lines.append(f"- {markdown_link(f'#{repo.rank} {repo.name}', repo.url)}")
        details = []
        if repo.language:
            details.append(f"语言: {repo.language}")
        if repo.stars:
            details.append(f"Stars: {repo.stars}")
        if repo.forks:
            details.append(f"Forks: {repo.forks}")
        if repo.stars_this_week:
            details.append(f"本周新增 Stars: {repo.stars_this_week}")
        if details:
            lines.append(f"  - 仓库信息: {'; '.join(details)}")
        if repo.description:
            lines.append(f"  - 项目描述: {repo.description}")
        if repo.readme_url:
            lines.append(f"  - README: {markdown_link('README', repo.readme_url)}")
        if repo.readme_excerpt:
            lines.append(f"  - README 摘录: {repo.readme_excerpt}")
        elif repo.readme_error:
            lines.append(f"  - README 抓取失败: {repo.readme_error}")
    lines.append("")


def append_status_markdown(lines: list[str], statuses: list[dict[str, str | int]], github_status: dict[str, str | int] | None) -> None:
    lines.extend(["## 抓取状态", ""])
    for status in statuses:
        if status["status"] == "ok":
            article_count = status.get("article_count")
            if article_count is None:
                lines.append(f"- {status['name']}: 成功, {status['count']} 条")
            else:
                lines.append(f"- {status['name']}: 成功, {status['count']} 个 issue, {article_count} 篇文章")
            if status.get("issue_errors"):
                lines.append(f"  - issue 抓取失败: {status['issue_errors']}")
        else:
            lines.append(f"- {status['name']}: 失败, {status['error']}")

    if github_status:
        if github_status["status"] == "ok":
            lines.append(
                f"- {github_status['name']}: 成功, {github_status['count']} 个仓库, "
                f"{github_status.get('readme_count', 0)} 个 README"
            )
        else:
            lines.append(f"- {github_status['name']}: 失败, {github_status['error']}")
    lines.append("")


def data_source_label(has_rss: bool, has_github: bool) -> str:
    sources = []
    if has_rss:
        sources.append("Cooperpress RSS feeds")
    if has_github:
        sources.append("GitHub Trending weekly")
    if not sources:
        sources.append("No data sources")
    if has_rss:
        sources.append("Ruby Weekly excluded")
    return ", ".join(sources)


def render_markdown(
    items: list[DigestItem],
    statuses: list[dict[str, str | int]],
    since_days: int | None,
    max_items_per_feed: int,
    articles: list[ArticleItem] | None = None,
    github_repos: list[TrendingRepo] | None = None,
    github_status: dict[str, str | int] | None = None,
) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    articles = articles or []
    github_repos = github_repos or []
    if articles:
        return render_articles_markdown(
            articles,
            statuses,
            since_days,
            max_items_per_feed,
            now,
            github_repos,
            github_status,
        )

    grouped: dict[str, list[DigestItem]] = defaultdict(list)
    for item in items:
        grouped[item.source].append(item)

    lines: list[str] = [
        "# Cooperpress 技术周刊 RSS 原始内容",
        "",
        "## 元信息",
        "",
        f"- 生成时间: {now.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"- 数据源: {data_source_label(bool(statuses), bool(github_repos or github_status))}",
        "- 分类状态: 未分类；由模型根据标题和摘要进行内容类型划分",
        f"- 每个 feed 最大条数: {'不限' if max_items_per_feed <= 0 else max_items_per_feed}",
        f"- 时间范围: 最近 {since_days} 天" if since_days else "- 时间范围: 未限制",
        f"- 收录条目: {len(items)}",
    ]
    if github_repos or github_status:
        lines.append(f"- GitHub Trending 仓库: {len(github_repos)}")
    lines.extend(["", "## RSS 条目", ""])

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

    append_github_trending_markdown(lines, github_repos)
    append_status_markdown(lines, statuses, github_status)
    return "\n".join(lines)


def render_articles_markdown(
    articles: list[ArticleItem],
    statuses: list[dict[str, str | int]],
    since_days: int | None,
    max_items_per_feed: int,
    now: dt.datetime,
    github_repos: list[TrendingRepo] | None = None,
    github_status: dict[str, str | int] | None = None,
) -> str:
    github_repos = github_repos or []
    raw_article_count = sum(len(article_occurrences(article)) for article in articles)
    merged_duplicate_count = raw_article_count - len(articles)
    grouped: dict[tuple[str, str, str], list[ArticleItem]] = defaultdict(list)
    for article in articles:
        grouped[(article.source, article.issue_title, article.issue_link)].append(article)

    lines: list[str] = [
        "# Cooperpress 技术周刊文章原始内容",
        "",
        "## 元信息",
        "",
        f"- 生成时间: {now.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"- 数据源: {data_source_label(bool(statuses), bool(github_repos or github_status))}",
        "- 内容层级: issue 内部文章级",
        "- 分类状态: 未分类；由模型根据标题和摘要进行内容类型划分",
        "- 重复条目: 已按规范化 URL 和标题合并跨 weekly 重复项",
        f"- 每个 feed 最大 issue 数: {'不限' if max_items_per_feed <= 0 else max_items_per_feed}",
        f"- 时间范围: 最近 {since_days} 天" if since_days else "- 时间范围: 未限制",
        f"- 收录文章: {len(articles)}",
    ]
    if merged_duplicate_count:
        lines.append(f"- 原始文章: {raw_article_count}; 合并重复条目: {merged_duplicate_count}")
    if github_repos or github_status:
        lines.append(f"- GitHub Trending 仓库: {len(github_repos)}")
    lines.extend(["", "## 文章条目", ""])

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
                occurrences = article_occurrences(article)
                sources = unique_join([occurrence.source for occurrence in occurrences])
                dates = unique_join([format_date(occurrence.issue_date) for occurrence in occurrences])
                sponsor_note = " sponsor" if any(occurrence.is_sponsor for occurrence in occurrences) else ""
                lines.append(f"- {markdown_link(article.title, article.link)}")
                lines.append(f"  - 发布日期: {dates}; 来源: {sources}{sponsor_note}")
                authors = unique_join([occurrence.author for occurrence in occurrences])
                if authors:
                    lines.append(f"  - 作者/机构: {authors}")
                if len(occurrences) > 1:
                    occurrence_notes = []
                    for occurrence in occurrences:
                        issue = markdown_link(occurrence.issue_title, occurrence.issue_link)
                        occurrence_notes.append(f"{occurrence.source} / {issue} / {occurrence.section}")
                    lines.append(f"  - 合并来源: {'; '.join(occurrence_notes)}")
                if article.summary:
                    lines.append(f"  - 摘要: {article.summary}")
            lines.append("")

    append_github_trending_markdown(lines, github_repos)
    append_status_markdown(lines, statuses, github_status)
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
    parser.add_argument("--include-github-trending", action="store_true", help="Fetch GitHub weekly trending repositories and README excerpts.")
    parser.add_argument("--github-trending-url", default=DEFAULT_GITHUB_TRENDING_URL, help="GitHub Trending URL. Defaults to weekly trending.")
    parser.add_argument("--max-trending-repos", type=int, default=25, help="Maximum GitHub Trending repositories. Defaults to 25; use 0 for all parsed repositories.")
    parser.add_argument("--readme-chars", type=int, default=1600, help="Maximum README excerpt characters per trending repository.")
    parser.add_argument("--print", action="store_true", dest="print_output", help="Print Markdown to stdout as well.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    feeds = build_feeds(args)
    if not feeds and not args.include_github_trending:
        print("No feeds configured. Use default feeds, pass --feed/--feed-file, or enable --include-github-trending.", file=sys.stderr)
        return 2

    all_items: list[DigestItem] = []
    all_articles: list[ArticleItem] = []
    statuses: list[dict[str, str | int]] = []
    github_repos: list[TrendingRepo] = []
    github_status: dict[str, str | int] | None = None

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

    if args.include_github_trending:
        github_repos, github_status = fetch_github_trending(
            args.github_trending_url,
            args.timeout,
            args.max_trending_repos,
            args.readme_chars,
        )

    all_items.sort(key=lambda item: item.published or dt.datetime.min.replace(tzinfo=dt.timezone.utc), reverse=True)
    all_articles.sort(
        key=lambda item: (item.issue_date or dt.datetime.min.replace(tzinfo=dt.timezone.utc), item.source, item.section),
        reverse=True,
    )
    all_articles = merge_duplicate_articles(all_articles)
    markdown = render_markdown(
        all_items,
        statuses,
        args.since_days,
        args.max_items_per_feed,
        all_articles,
        github_repos,
        github_status,
    )

    output = Path(args.output) if args.output else Path(f"cooperpress-weekly-digest-{dt.date.today().isoformat()}.md")
    output.write_text(markdown, encoding="utf-8")

    if args.print_output:
        print(markdown)
    else:
        print(f"Wrote {output}")

    ok_count = sum(1 for status in statuses if status["status"] == "ok")
    if github_status and github_status["status"] == "ok":
        ok_count += 1
    return 0 if ok_count else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
