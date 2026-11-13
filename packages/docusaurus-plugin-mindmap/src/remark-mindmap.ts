import type { MindmapNode, MindmapRef } from "./client/layout.ts";

interface MdastNode {
  type: string;
  depth?: number;
  name?: string;
  value?: string;
  url?: string;
  children?: MdastNode[];
  attributes?: unknown[];
}

const TAG_NAME = "Mindmap";
const COMPONENT_NAME = "MindmapBlock";
const DOC_ID_PATTERN = /doc:([A-Za-z0-9-]+)/;
const NUMBER_PREFIX_PATTERN = /^(\d+(?:\.\d+)*)\s*(\S.*)$/;

const textOf = (node: MdastNode): string => {
  if (node.type === "html") return "";
  if (node.type === "textDirective") return ":" + (node.name ?? "");
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textOf).join("");
};

const refsOf = (nodes: MdastNode[]): { refs: MindmapRef[]; text: string } => {
  const refs: MindmapRef[] = [];
  const plain: string[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index] as MdastNode;
    if (node.type !== "link") {
      plain.push(textOf(node));
      continue;
    }
    const url = node.url ?? "";
    const label = textOf(node).trim();
    if (url.startsWith("#")) {
      const numbered = url.slice(1).match(/^(\d+(?:\.\d+)*)/);
      if (!numbered) throw new Error("节点引用要写编号，例如 [1.2](#1.2)，收到 " + url);
      refs.push({ kind: "node", target: numbered[1] as string, label });
      continue;
    }
    let trailing = "";
    while (index + 1 < nodes.length && (nodes[index + 1] as MdastNode).type !== "link") {
      index += 1;
      trailing += textOf(nodes[index] as MdastNode);
    }
    const docId = trailing.match(DOC_ID_PATTERN)?.[1];
    if (!docId) throw new Error("文档引用后面要写 doc:<文档id>：[" + label + "](" + url + ")");
    refs.push({ kind: "doc", target: docId, label, url: "/" + docId });
  }
  return { refs, text: refs.length === 0 ? plain.join("").trim() : "" };
};

const buildTree = (children: MdastNode[], filePath: string): MindmapNode => {
  const headings: {
    depth: number;
    number: string;
    title: string;
    overview: string[];
    refs: MindmapRef[];
  }[] = [];
  let current: (typeof headings)[number] | undefined;

  children.forEach((child) => {
    if (child.type === "heading" && typeof child.depth === "number") {
      const raw = textOf(child).trim();
      if (raw === "") throw new Error("Mindmap 里有空标题（" + filePath + "）");
      const numbered = raw.match(NUMBER_PREFIX_PATTERN);
      if (!numbered) {
        throw new Error(
          "标题要以数字前缀开头，例如「## 1.2 接口」，收到「" + raw + "」（" + filePath + "）",
        );
      }
      const entry = {
        depth: child.depth,
        number: numbered[1] as string,
        title: (numbered[2] as string).trim(),
        overview: [],
        refs: [],
      };
      headings.push(entry);
      current = entry;
      return;
    }
    if (!current) return;
    if (child.type === "blockquote") {
      const paragraphs = (child.children ?? []).flatMap((item) =>
        item.type === "list" ? (item.children ?? []) : [item],
      );
      paragraphs.forEach((item) => {
        const paragraph = item.type === "listItem" ? (item.children ?? [])[0] : item;
        if (!paragraph) return;
        const parsed = refsOf((paragraph.children ?? []) as MdastNode[]);
        if (parsed.refs.length > 0) current?.refs.push(...parsed.refs);
        else if (parsed.text !== "") current?.overview.push(parsed.text);
      });
      return;
    }
    if (child.type === "paragraph") {
      const parsed = refsOf(child.children ?? []);
      if (parsed.refs.length > 0) current.refs.push(...parsed.refs);
      else if (parsed.text !== "") current.overview.push(parsed.text);
    }
  });

  const roots = headings.filter((heading) => heading.depth === 1);
  if (roots.length !== 1) {
    throw new Error("Mindmap 必须恰好有一个 # 一级标题作为根节点（" + filePath + "）");
  }

  const toNode = (heading: (typeof headings)[number]): MindmapNode => ({
    id: heading.number,
    title: heading.title,
    overview: heading.overview,
    refs: heading.refs,
    children: [],
  });

  const root = toNode(roots[0] as (typeof headings)[number]);
  const stack: { node: MindmapNode; level: number }[] = [{ node: root, level: 1 }];
  const seen = new Set<string>([root.id]);

  headings.forEach((heading) => {
    if (heading === roots[0]) return;
    while (
      stack.length > 1 &&
      (stack[stack.length - 1] as { level: number }).level >= heading.depth
    ) {
      stack.pop();
    }
    const parent = stack[stack.length - 1] as { node: MindmapNode; level: number };
    if (heading.depth > parent.level + 1) {
      throw new Error(
        "Mindmap 标题层级从 H" +
          String(parent.level) +
          " 跳到 H" +
          String(heading.depth) +
          "（" +
          filePath +
          "）",
      );
    }
    const node = toNode(heading);
    if (seen.has(node.id))
      throw new Error("Mindmap 节点编号「" + node.id + "」重复（" + filePath + "）");
    seen.add(node.id);
    parent.node.children.push(node);
    stack.push({ node, level: heading.depth });
  });

  const ids = new Set<string>();
  (function visit(node: MindmapNode): void {
    ids.add(node.id);
    node.children.forEach(visit);
  })(root);
  (function check(node: MindmapNode): void {
    node.refs.forEach((ref) => {
      if (ref.kind === "node" && !ids.has(ref.target)) {
        throw new Error("引用的节点编号 " + ref.target + " 不存在（" + filePath + "）");
      }
    });
    node.children.forEach(check);
  })(root);
  return root;
};

const walk = (node: MdastNode, visit: (node: MdastNode) => void): void => {
  visit(node);
  (node.children ?? []).forEach((child) => walk(child, visit));
};

const remarkMindmap =
  () =>
  (tree: MdastNode, file: { history?: string[]; path?: string }): void => {
    const filePath = file.path ?? file.history?.[0] ?? "markdown";
    walk(tree, (node) => {
      if (node.type !== "mdxJsxFlowElement" || node.name !== TAG_NAME) return;
      const mindmap = buildTree(node.children ?? [], filePath);
      node.name = COMPONENT_NAME;
      node.attributes = [{ type: "mdxJsxAttribute", name: "tree", value: JSON.stringify(mindmap) }];
      node.children = [];
    });
  };

export { buildTree };
export default remarkMindmap;
