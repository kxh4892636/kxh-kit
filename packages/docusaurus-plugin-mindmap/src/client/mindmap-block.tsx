import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MAX_SCALE,
  MIN_SCALE,
  placeTree,
  panView,
  zoomView,
  type MindmapNode,
  type MindmapRef,
  type PlacedNode,
  type ViewState,
} from "./layout.ts";
import { mindmapStyles } from "./styles.ts";

interface MindmapBlockProps {
  tree: string;
}

// 平移与缩放直接改 DOM（transform、读数、浮窗坐标），不走 React 渲染：
// 上百节点时每帧 setState 会把整棵 SVG 重建一遍。

const collect = (node: MindmapNode, output: Map<string, MindmapNode>): Map<string, MindmapNode> => {
  output.set(node.id, node);
  node.children.forEach((child) => collect(child, output));
  return output;
};

const RefIcon: React.FC<{ kind: MindmapRef["kind"] }> = (props) => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d={
        props.kind === "doc"
          ? "M6 3h7v7M13 3 4.5 11.5M3 6v7h7"
          : "M8 2.5v11M2.5 8h11M8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"
      }
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    />
  </svg>
);

export const MindmapBlock: React.FC<MindmapBlockProps> = (props) => {
  const root = useMemo(() => JSON.parse(props.tree) as MindmapNode, [props.tree]);
  const tree = useMemo(() => placeTree(root), [root]);
  const nodeMap = useMemo(() => collect(root, new Map<string, MindmapNode>()), [root]);
  const placedMap = useMemo(
    () => new Map<string, PlacedNode>(tree.nodes.map((node) => [node.id, node])),
    [tree],
  );
  const frameRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<ViewState>({ x: 0, y: 0, scale: 1 });
  const popoverPlaced = useRef<PlacedNode | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [popoverId, setPopoverId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ x: number; y: number; origin: ViewState } | null>(null);

  const selectedNode = popoverId ? (nodeMap.get(popoverId) ?? null) : null;
  popoverPlaced.current = popoverId ? (placedMap.get(popoverId) ?? null) : null;

  const positionOf = useCallback(
    (placed: PlacedNode): { left: number; top: number } => {
      const view = viewRef.current;
      const frame = frameRef.current;
      const width = frame ? frame.getBoundingClientRect().width : 0;
      const nodeLeft = view.x + placed.x * view.scale;
      const nodeRight = nodeLeft + placed.width * view.scale;
      const contentLeft = view.x + tree.minX * view.scale;
      const contentRight = view.x + tree.maxX * view.scale;
      const onLeft = (nodeLeft + nodeRight) / 2 < (contentLeft + contentRight) / 2;
      const candidate = onLeft ? contentLeft - 360 : contentRight + 20;
      return {
        left: Math.max(12, Math.min(candidate, Math.max(12, width - 360))),
        top: Math.max(12, view.y + placed.y * view.scale),
      };
    },
    [tree],
  );

  const placePopover = useCallback((): void => {
    const element = popoverRef.current;
    const placed = popoverPlaced.current;
    if (!element || !placed) return;
    const spot = positionOf(placed);
    element.style.left = String(spot.left) + "px";
    element.style.top = String(spot.top) + "px";
  }, [positionOf]);

  const applyView = useCallback((): void => {
    const view = viewRef.current;
    groupRef.current?.setAttribute(
      "transform",
      "translate(" + String(view.x) + " " + String(view.y) + ") scale(" + String(view.scale) + ")",
    );
    if (readoutRef.current) {
      readoutRef.current.textContent = String(Math.round(view.scale * 100)) + "%";
    }
    placePopover();
  }, [placePopover]);

  const showDefault = useCallback((): void => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const width = tree.maxX - tree.minX;
    const height = tree.maxY - tree.minY;
    const scale = width > rect.width - 48 ? Math.max(0.45, (rect.width - 48) / width) : 1;
    viewRef.current = {
      scale,
      x: Math.max(16, (rect.width - width * scale) / 2 - tree.minX * scale),
      y:
        height * scale < rect.height - 48
          ? (rect.height - height * scale) / 2 - tree.minY * scale
          : 16 - tree.minY * scale,
    };
    applyView();
  }, [tree, applyView]);

  const centreOn = useCallback(
    (id: string): void => {
      const frame = frameRef.current;
      const placed = placedMap.get(id);
      if (!frame || !placed) return;
      const rect = frame.getBoundingClientRect();
      const scale = viewRef.current.scale;
      viewRef.current = {
        scale,
        x: rect.width / 2 - (placed.x + placed.width / 2) * scale,
        y: rect.height / 2 - (placed.y + placed.height / 2) * scale,
      };
      applyView();
    },
    [placedMap, applyView],
  );

  useEffect(() => {
    showDefault();
  }, [showDefault]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => showDefault());
    observer.observe(frame);
    return () => observer.disconnect();
  }, [showDefault, expanded]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      viewRef.current = zoomView(
        viewRef.current,
        factor,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      applyView();
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => showDefault());
    return () => {
      document.body.style.overflow = previous;
      window.requestAnimationFrame(() => showDefault());
    };
  }, [expanded, showDefault]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setPopoverId(null);
      setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const followRef = (ref: MindmapRef): void => {
    if (ref.kind === "doc") {
      if (!ref.url) return;
      window.open(new URL(ref.url, window.location.href).toString(), "_blank", "noopener");
      return;
    }
    if (!placedMap.has(ref.target)) return;
    setSelected(ref.target);
    setPopoverId(null);
    centreOn(ref.target);
  };

  const zoomBy = (factor: number): void => {
    const current = viewRef.current;
    viewRef.current = {
      x: current.x,
      y: current.y,
      scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, current.scale * factor)),
    };
    applyView();
  };

  const popoverSpot = popoverPlaced.current ? positionOf(popoverPlaced.current) : null;

  const content = (
    <div className={expanded ? "mindmap-block mindmap-block--expanded" : "mindmap-block"}>
      <style dangerouslySetInnerHTML={{ __html: mindmapStyles }} />
      <div className="mindmap-block__bar">
        <span className="mindmap-block__meta">
          {"思维导图 · " +
            String(tree.nodes.length) +
            " 个节点，" +
            String(tree.nodes.reduce((total, node) => total + node.refCount, 0)) +
            " 条引用"}
        </span>
        <span className="mindmap-block__actions">
          <button
            type="button"
            className="button button--secondary button--sm"
            aria-label="缩小"
            onClick={() => zoomBy(1 / 1.2)}
          >
            −
          </button>
          <span className="mindmap-block__readout" ref={readoutRef}>
            100%
          </span>
          <button
            type="button"
            className="button button--secondary button--sm"
            aria-label="放大"
            onClick={() => zoomBy(1.2)}
          >
            +
          </button>
          <button
            type="button"
            className="button button--secondary button--sm"
            onClick={showDefault}
          >
            适应宽度
          </button>
          <button
            type="button"
            className="button button--secondary button--sm"
            onClick={() => setExpanded(false)}
          >
            退出浮窗
          </button>
        </span>
      </div>
      <div
        className="mindmap-block__frame"
        ref={frameRef}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY, origin: viewRef.current };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const start = drag.current;
          viewRef.current = panView(start.origin, event.clientX - start.x, event.clientY - start.y);
          applyView();
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setPopoverId(null);
        }}
      >
        <svg className="mindmap-block__svg" role="group" aria-label="思维导图">
          <g ref={groupRef}>
            {tree.edges.map((edge, index) => (
              <path
                key={"edge-" + String(index)}
                className="mindmap-block__edge"
                d={edge.d}
                strokeWidth={edge.width}
              />
            ))}
            {tree.nodes.map((node) => (
              <g
                key={node.id}
                className={
                  node.depth === 0
                    ? "mindmap-block__node mindmap-block__node--root"
                    : "mindmap-block__node"
                }
                transform={"translate(" + String(node.x) + " " + String(node.y) + ")"}
                role="button"
                tabIndex={0}
                aria-pressed={selected === node.id}
                aria-label={node.title}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelected(node.id);
                  setPopoverId(node.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(node.id);
                    setPopoverId(node.id);
                  }
                }}
              >
                <rect
                  className="mindmap-block__box"
                  width={node.width}
                  height={node.height}
                  rx={8}
                />
                <text className="mindmap-block__title" x={12} y={24}>
                  {node.lines.map((line, index) => (
                    <tspan key={String(index)} x={12} dy={index === 0 ? 0 : 22}>
                      {line}
                    </tspan>
                  ))}
                </text>
                <text className="mindmap-block__id" x={12} y={node.height - 10}>
                  {node.id}
                </text>
                {node.refCount > 0 ? (
                  <text
                    className="mindmap-block__count"
                    x={node.width - 12}
                    y={node.height - 10}
                    textAnchor="end"
                  >
                    {String(node.refCount) + " 条引用"}
                  </text>
                ) : null}
              </g>
            ))}
          </g>
        </svg>
        {expanded ? null : (
          <button
            type="button"
            className="button button--secondary button--sm mindmap-block__expand"
            onClick={() => setExpanded(true)}
          >
            全屏
          </button>
        )}
        {selectedNode ? (
          <div
            className="mindmap-block__popover"
            ref={popoverRef}
            style={popoverSpot ?? undefined}
            role="dialog"
            aria-label={selectedNode.title}
          >
            <div className="mindmap-block__popover-head">
              <h3>{selectedNode.title}</h3>
              <span className="mindmap-block__popover-id">{"#" + selectedNode.id}</span>
            </div>
            {selectedNode.overview.length > 0 ? (
              <ul className="mindmap-block__overview">
                {selectedNode.overview.map((line, index) => (
                  <li key={String(index)}>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {selectedNode.refs.length > 0 ? (
              <div className="mindmap-block__refs">
                <p className="mindmap-block__refs-label">引用</p>
                {selectedNode.refs.map((ref, index) => (
                  <button
                    key={ref.kind + ref.target + String(index)}
                    type="button"
                    className="mindmap-block__ref"
                    onClick={() => followRef(ref)}
                  >
                    <span>
                      {ref.label === selectedNode.title
                        ? ref.kind === "doc"
                          ? "打开这篇笔记"
                          : "跳到本图节点"
                        : ref.label}
                    </span>
                    <span className="mindmap-block__ref-target">
                      <RefIcon kind={ref.kind} />
                      {ref.kind === "doc" ? " 文档，新标签页" : " 本图节点 #" + ref.target}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="button button--secondary button--sm"
              style={{ marginTop: "0.75rem" }}
              onClick={() => setPopoverId(null)}
            >
              关闭
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!expanded || typeof document === "undefined") return content;
  return createPortal(
    <div className="mindmap-overlay" onClick={() => setExpanded(false)}>
      <div className="mindmap-overlay__panel" onClick={(event) => event.stopPropagation()}>
        {content}
      </div>
    </div>,
    document.body,
  );
};

export default MindmapBlock;
