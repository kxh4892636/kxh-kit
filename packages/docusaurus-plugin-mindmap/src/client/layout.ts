export interface MindmapRef {
  kind: "doc" | "node";
  target: string;
  label: string;
  url?: string;
}

export interface MindmapNode {
  id: string;
  title: string;
  overview: string[];
  refs: MindmapRef[];
  children: MindmapNode[];
}

export const NODE_WIDTH = 240;
export const ROOT_WIDTH = 264;
const COLUMN_GAP = 92;
const ROW_GAP = 22;
const TITLE_STEP = 22;
const CHARS_PER_LINE = 12;

export interface PlacedNode {
  id: string;
  title: string;
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  refCount: number;
}

export interface PlacedEdge {
  d: string;
  width: number;
}

export interface PlacedTree {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const trimEdges = (text: string): string => {
  let out = text;
  while (out.startsWith(" ")) out = out.slice(1);
  while (out.endsWith(" ")) out = out.slice(0, -1);
  return out;
};

export const wrapTitle = (title: string, per: number = CHARS_PER_LINE): string[] => {
  const lines: string[] = [];
  let rest = title;
  while (rest.length > per) {
    const window9 = rest.slice(0, per + 2);
    let cut = per;
    const marks = [" ", "、", "，", "）", "；", ":"];
    for (const mark of marks) {
      const at = window9.lastIndexOf(mark);
      if (at >= per - 3 && at > cut - 6) {
        cut = at + 1;
        break;
      }
    }
    const before = rest.charAt(cut - 1);
    const after = rest.charAt(cut);
    if (/[A-Za-z]/.test(before) && /[A-Za-z]/.test(after)) {
      let wordStart = cut;
      while (wordStart > 0 && /[A-Za-z]/.test(rest.charAt(wordStart - 1))) wordStart -= 1;
      if (wordStart > per * 0.4) cut = wordStart;
    }
    lines.push(trimEdges(rest.slice(0, cut)));
    rest = trimEdges(rest.slice(cut));
  }
  lines.push(trimEdges(rest));
  return lines.length > 3 ? lines.slice(0, 3) : lines;
};

const heightOf = (lines: number, hasRefs: boolean): number =>
  26 + lines * TITLE_STEP + (hasRefs ? 20 : 16);

interface WorkingNode {
  node: MindmapNode;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
}

const layoutBranch = (params: {
  node: MindmapNode;
  depth: number;
  cursor: { top: number };
  out: WorkingNode[];
  map: Map<MindmapNode, WorkingNode>;
}): WorkingNode => {
  const { node, depth, cursor, out, map } = params;
  const lines = wrapTitle(node.title);
  const height = heightOf(lines.length, node.refs.length > 0);
  const width = NODE_WIDTH;
  let y = 0;
  if (node.children.length === 0) {
    y = cursor.top;
    cursor.top += height + ROW_GAP;
  } else {
    const placed = node.children.map((child) =>
      layoutBranch({ node: child, depth: depth + 1, cursor, out, map }),
    );
    const first = placed[0]!;
    const last = placed[placed.length - 1]!;
    y = (first.y + last.y + last.height) / 2 - height / 2;
  }
  const working: WorkingNode = { node, depth, x: 0, y, width, height, lines };
  out.push(working);
  map.set(node, working);
  return working;
};

const assignX = (params: {
  working: WorkingNode;
  x: number;
  dir: 1 | -1;
  map: Map<MindmapNode, WorkingNode>;
}): void => {
  const { working, x, dir, map } = params;
  working.x = x;
  working.node.children.forEach((child) => {
    const childWorking = map.get(child)!;
    const nextX = dir > 0 ? x + working.width + COLUMN_GAP : x - COLUMN_GAP - childWorking.width;
    assignX({ working: childWorking, x: nextX, dir, map });
  });
};

export const placeTree = (root: MindmapNode): PlacedTree => {
  const out: WorkingNode[] = [];
  const rootLines = wrapTitle(root.title);
  const rootWorking: WorkingNode = {
    node: root,
    depth: 0,
    x: 0,
    y: 0,
    width: ROOT_WIDTH,
    height: heightOf(rootLines.length, root.refs.length > 0),
    lines: rootLines,
  };
  out.push(rootWorking);

  const split = Math.ceil(root.children.length / 2);
  const rightKids = root.children.slice(0, split);
  const leftKids = root.children.slice(split);
  const cursorRight = { top: 0 };
  const cursorLeft = { top: 0 };
  const map = new Map<MindmapNode, WorkingNode>([[root, rootWorking]]);
  rightKids.forEach((child) => {
    layoutBranch({ node: child, depth: 1, cursor: cursorRight, out, map });
  });
  leftKids.forEach((child) => {
    layoutBranch({ node: child, depth: 1, cursor: cursorLeft, out, map });
  });

  const extent = (list: MindmapNode[]): { top: number; bottom: number } => {
    if (list.length === 0) return { top: 0, bottom: 0 };
    const placed = list.map((child) => map.get(child)!);
    return {
      top: Math.min(...placed.map((item) => item.y)),
      bottom: Math.max(...placed.map((item) => item.y + item.height)),
    };
  };
  const rightBox = extent(rightKids);
  const leftBox = extent(leftKids);
  const top = Math.min(rightBox.top, leftBox.top);
  const bottom = Math.max(rightBox.bottom, leftBox.bottom);
  rootWorking.y = (top + bottom) / 2 - rootWorking.height / 2;

  const shift = (list: MindmapNode[], delta: number): void => {
    const walk = (node: MindmapNode): void => {
      const working = map.get(node)!;
      working.y += delta;
      node.children.forEach(walk);
    };
    list.forEach(walk);
  };
  const centreY = rootWorking.y + rootWorking.height / 2;
  if (rightKids.length > 0) shift(rightKids, centreY - (rightBox.top + rightBox.bottom) / 2);
  if (leftKids.length > 0) shift(leftKids, centreY - (leftBox.top + leftBox.bottom) / 2);

  rightKids.forEach((child) =>
    assignX({ working: map.get(child)!, x: ROOT_WIDTH + COLUMN_GAP, dir: 1, map }),
  );
  leftKids.forEach((child) => {
    const working = map.get(child)!;
    assignX({ working, x: -COLUMN_GAP - working.width, dir: -1, map });
  });

  const edges: PlacedEdge[] = [];
  const pushEdge = (parent: MindmapNode, child: MindmapNode, dir: 1 | -1): void => {
    const parentWorking = map.get(parent)!;
    const childWorking = map.get(child)!;
    const x1 = dir > 0 ? parentWorking.x + parentWorking.width : parentWorking.x;
    const y1 = parentWorking.y + parentWorking.height / 2;
    const x2 = dir > 0 ? childWorking.x : childWorking.x + childWorking.width;
    const y2 = childWorking.y + childWorking.height / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.55);
    const c1 = x1 + dir * dx;
    const c2 = x2 - dir * dx;
    const width = Math.max(1, 2.1 - 0.45 * (childWorking.depth - 1));
    edges.push({
      d:
        "M" +
        String(x1) +
        " " +
        String(y1) +
        " C" +
        String(c1) +
        " " +
        String(y1) +
        ", " +
        String(c2) +
        " " +
        String(y2) +
        ", " +
        String(x2) +
        " " +
        String(y2),
      width,
    });
  };
  const walkSide = (parent: MindmapNode, children: MindmapNode[], dir: 1 | -1): void => {
    children.forEach((child) => {
      pushEdge(parent, child, dir);
      walkSide(child, child.children, dir);
    });
  };
  walkSide(root, rightKids, 1);
  walkSide(root, leftKids, -1);

  const nodes: PlacedNode[] = out.map((working) => ({
    id: working.node.id,
    title: working.node.title,
    lines: working.lines,
    x: working.x,
    y: working.y,
    width: working.width,
    height: working.height,
    depth: working.depth,
    refCount: working.node.refs.length,
  }));

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  return { nodes, edges, minX, minY, maxX, maxY };
};

export interface ViewState {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.35;
export const MAX_SCALE = 2;

export const panView = (view: ViewState, dx: number, dy: number): ViewState => ({
  x: view.x + dx,
  y: view.y + dy,
  scale: view.scale,
});

export const zoomView = (view: ViewState, factor: number, px: number, py: number): ViewState => {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  return {
    scale,
    x: px - (px - view.x) * (scale / view.scale),
    y: py - (py - view.y) * (scale / view.scale),
  };
};
