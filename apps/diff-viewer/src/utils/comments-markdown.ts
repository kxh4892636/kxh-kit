// 一键复制的输出格式 (issue 05): Markdown 列表, 每条评论含 `文件:行号`、
// 引用代码块 (有代码快照时) 与评论正文, 可直接粘贴给 AI。
// 与 commentFormatting.ts 的 ===== 分隔 prompt 格式并存: 后者是 fork 既有资产,
// 本模块是 issue 05 规定的新格式, 互不改写。
import type { DiffCommentThread, DiffLineRange } from "../types/diff.js";

const formatLineRef = (line: DiffLineRange): string =>
  typeof line === "number" ? `L${line}` : `L${line.start}-L${line.end}`;

// 快照内容本身含 ``` 时 (例如 markdown 文件), 用更长围栏避免提前闭合
const pickFence = (content: string): string => (content.includes("```") ? "````" : "```");

// 列表项的嵌套内容统一缩进两格, 保证渲染时仍属同一列表项; 空行保持真空
const indentLines = (text: string): string =>
  text
    .split(/\r?\n/)
    .map((line) => (line.length > 0 ? `  ${line}` : ""))
    .join("\n");

const formatThreadMarkdown = (thread: DiffCommentThread): string => {
  const sections: string[] = [
    `- \`${thread.filePath || "<unknown file>"}:${formatLineRef(thread.position.line)}\`${
      thread.position.side === "old" ? " (old)" : ""
    }`,
  ];

  const snapshot = thread.codeSnapshot;
  if (snapshot && snapshot.content.trim().length > 0) {
    const fence = pickFence(snapshot.content);
    const language = snapshot.language ?? "";
    sections.push(`${fence}${language}\n${snapshot.content}\n${fence}`);
  }

  thread.messages.forEach((message, index) => {
    if (index === 0) {
      if (message.body.trim().length > 0) {
        sections.push(message.body);
      }
      return;
    }
    const authorLabel = message.author?.trim() || "Unknown";
    sections.push(`Reply ${index} (${authorLabel}):\n${message.body}`);
  });

  return sections
    .map((section, index) => (index === 0 ? section : indentLines(section)))
    .join("\n\n");
};

export const formatCommentsMarkdown = (threads: DiffCommentThread[]): string => {
  if (threads.length === 0) {
    return "";
  }
  return threads.map(formatThreadMarkdown).join("\n\n");
};
