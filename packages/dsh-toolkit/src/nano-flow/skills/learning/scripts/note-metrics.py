#!/usr/bin/env python3
"""笔记形态检测：只输出「参考值 + 实测值」，不给修改建议。

用法:
    python3 note-metrics.py <目录或文件>... [--detail] [--json] [--exclude <路径子串>]

口径与 SKILL.md 一致:
    - 每篇行数: 整份 Markdown 的行数;
    - 条目字数: 列表条目去掉 `- ` 后的字符数;
    - 每节条数: 每个 H2 之下的列表条目数;
    - 参考值固定写在本文件，改动需同步 SKILL.md。

分位数用线性插值，保留 1 位小数；超限阈值是条目 60 字、每节 8 条。
"""

from __future__ import annotations

import json
import os
import re
import sys
import unicodedata

# SKILL.md 里的分布数值；这里是唯一实现，脚本与文档要保持一致。
REFERENCE = {
    "lines": {"mean": 50.7, "p50": 48.0, "p90": 93.0, "p95": 110.0, "max": 149},
    "bullet": {"mean": 33.3, "p50": 29.0, "p90": 56.0, "p95": 69.0, "over60": 7.9},
    "section": {"mean": 3.5, "p50": 3.0, "p90": 6.0, "over8": 2.2},
}

# 超长阈值: 条目 60 字、每节 8 条。
LIMITS = {"bullet": 60, "section": 8}

BULLET = re.compile(r"^\s*[-*] ")
FENCE = re.compile(r"^\s*```")
H2 = re.compile(r"^## ")


def collect_files(targets: list[str], excludes: list[str]) -> tuple[list[str], list[str]]:
    """递归收集 Markdown 笔记，跳过 README.md 与命中的排除子串。"""
    files: list[str] = []
    missing: list[str] = []
    for target in targets:
        if any(pattern in target for pattern in excludes):
            continue
        if not os.path.exists(target):
            missing.append(target)
            continue
        if os.path.isfile(target):
            if target.endswith(".md") and os.path.basename(target) != "README.md":
                files.append(target)
            continue
        for root, dirs, names in os.walk(target):
            dirs[:] = sorted(d for d in dirs if not any(pattern in os.path.join(root, d) for pattern in excludes))
            for name in sorted(names):
                path = os.path.join(root, name)
                if not name.endswith(".md") or name == "README.md":
                    continue
                if any(pattern in path for pattern in excludes):
                    continue
                files.append(path)
    return files, missing


def read_note(file: str) -> dict:
    """解析一份笔记: 行数、条目字数、每节条数。"""
    with open(file, encoding="utf-8") as handle:
        rows = handle.read().split("\n")
    if rows and rows[-1] == "":
        rows.pop()

    start = 0
    if rows and rows[0].strip() == "---":
        start = 1
        while start < len(rows) and rows[start].strip() != "---":
            start += 1
        start += 1

    bullets: list[int] = []
    sections: list[int] = []
    current: int | None = None
    fence = False
    for line in rows[start:]:
        if FENCE.match(line):
            fence = not fence
            continue
        if fence:
            continue
        if H2.match(line):
            if current is not None:
                sections.append(current)
            current = 0
            continue
        if BULLET.match(line):
            bullets.append(len(BULLET.sub("", line)))
            if current is not None:
                current += 1
    if current is not None:
        sections.append(current)

    return {"file": file, "lines": len(rows), "bullet": bullets, "section": sections}


def quantile(values: list[float], percent: float) -> float:
    """线性插值分位数; 输入无需预排序。"""
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * percent / 100
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def mean(values: list[float]) -> float:
    return 0.0 if not values else sum(values) / len(values)


def percent(count: int, total: int) -> float:
    return 0.0 if total == 0 else count / total * 100


def summarize(notes: list[dict]) -> dict:
    """汇总为三组分布。"""
    lines = [note["lines"] for note in notes]
    bullets = [value for note in notes for value in note["bullet"]]
    sections = [value for note in notes for value in note["section"]]
    rnd = lambda value: round(value, 1)  # noqa: E731
    return {
        "files": len(notes),
        "bulletCount": len(bullets),
        "sectionCount": len(sections),
        "lines": {
            "mean": rnd(mean(lines)),
            "p50": rnd(quantile(lines, 50)),
            "p90": rnd(quantile(lines, 90)),
            "p95": rnd(quantile(lines, 95)),
            "max": max(lines) if lines else 0,
        },
        "bullet": {
            "mean": rnd(mean(bullets)),
            "p50": rnd(quantile(bullets, 50)),
            "p90": rnd(quantile(bullets, 90)),
            "p95": rnd(quantile(bullets, 95)),
            "over60": rnd(percent(sum(1 for value in bullets if value > LIMITS["bullet"]), len(bullets))),
        },
        "section": {
            "mean": rnd(mean(sections)),
            "p50": rnd(quantile(sections, 50)),
            "p90": rnd(quantile(sections, 90)),
            "over8": rnd(percent(sum(1 for value in sections if value > LIMITS["section"]), len(sections))),
        },
    }


def rows(summary: dict) -> list[list[str]]:
    one = lambda value: f"{value:.1f}"  # noqa: E731
    return [
        ["每篇行数", "均值", one(REFERENCE["lines"]["mean"]), one(summary["lines"]["mean"])],
        ["", "P50", one(REFERENCE["lines"]["p50"]), one(summary["lines"]["p50"])],
        ["", "P90", one(REFERENCE["lines"]["p90"]), one(summary["lines"]["p90"])],
        ["", "P95", one(REFERENCE["lines"]["p95"]), one(summary["lines"]["p95"])],
        ["", "最长", str(REFERENCE["lines"]["max"]), str(summary["lines"]["max"])],
        ["条目字数", "均值", one(REFERENCE["bullet"]["mean"]), one(summary["bullet"]["mean"])],
        ["", "P50", one(REFERENCE["bullet"]["p50"]), one(summary["bullet"]["p50"])],
        ["", "P90", one(REFERENCE["bullet"]["p90"]), one(summary["bullet"]["p90"])],
        ["", "P95", one(REFERENCE["bullet"]["p95"]), one(summary["bullet"]["p95"])],
        ["", "超 60 字占比 %", one(REFERENCE["bullet"]["over60"]), one(summary["bullet"]["over60"])],
        ["每节条数", "均值", one(REFERENCE["section"]["mean"]), one(summary["section"]["mean"])],
        ["", "P50", one(REFERENCE["section"]["p50"]), one(summary["section"]["p50"])],
        ["", "P90", one(REFERENCE["section"]["p90"]), one(summary["section"]["p90"])],
        ["", "超 8 条占比 %", one(REFERENCE["section"]["over8"]), one(summary["section"]["over8"])],
    ]


def width_of(text: str) -> int:
    """显示宽度: 全角与 CJK 记 2 列。"""
    return sum(2 if unicodedata.east_asian_width(char) in "WF" else 1 for char in text)


def render(summary: dict) -> str:
    header = ["指标", "统计量", "参考", "实测"]
    body = rows(summary)
    widths = [max(width_of(header[i]), *(width_of(row[i]) for row in body)) + 2 for i in range(4)]
    line = lambda cells: "".join(  # noqa: E731
        cell + " " * max(0, widths[index] - width_of(cell)) for index, cell in enumerate(cells)
    ).rstrip()
    divider = " ".join("─" * (size - 1) for size in widths)
    out = [
        f"篇数 {summary['files']} · 条目 {summary['bulletCount']} · 小节 {summary['sectionCount']}",
        line(header),
        divider,
        *(line(row) for row in body),
    ]
    return "\n".join(out)


def split_args(argv: list[str]) -> tuple[list[str], list[str], bool, bool]:
    detail = "--detail" in argv
    as_json = "--json" in argv
    excludes: list[str] = []
    targets: list[str] = []
    index = 0
    while index < len(argv):
        arg = argv[index]
        if arg == "--exclude" and index + 1 < len(argv):
            excludes.append(argv[index + 1])
            index += 2
            continue
        if arg.startswith("--exclude="):
            excludes.append(arg.split("=", 1)[1])
        elif not arg.startswith("--"):
            targets.append(arg)
        index += 1
    return targets, excludes, detail, as_json


def main(argv: list[str]) -> int:
    targets, excludes, detail, as_json = split_args(argv)
    if not targets:
        sys.stderr.write("用法: python3 note-metrics.py <目录或文件>... [--detail] [--json] [--exclude <路径子串>]\n")
        return 2
    files, missing = collect_files(targets, excludes)
    if missing:
        sys.stderr.write(f"路径不存在: {', '.join(missing)}\n")
    if not files:
        sys.stderr.write("没有找到 Markdown 笔记\n")
        return 1
    notes = [read_note(file) for file in files]
    summary = summarize(notes)
    if as_json:
        payload = {"summary": summary}
        if detail:
            payload["notes"] = [
                {"file": note["file"], "lines": note["lines"], "sections": len(note["section"])} for note in notes
            ]
        sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        return 0
    sys.stdout.write(render(summary) + "\n")
    if detail:
        sys.stdout.write("\n逐篇现状（行数 / 小节数）\n")
        for note in sorted(notes, key=lambda item: item["lines"], reverse=True):
            sys.stdout.write(f"{note['lines']:>4} / {len(note['section']):>3}  {note['file']}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
