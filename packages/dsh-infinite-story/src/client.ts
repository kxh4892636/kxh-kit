/**
 * Client plugin: the story-mode chooser in the session header.
 *
 * Rendered as a dropdown, matching the permission selector's interaction model:
 * a trigger button showing the current state, and a menu listing 关闭 / 开启 · <story>.
 *
 * Host communication goes through the `/api/infinite-story` bridge. Everything is
 * defensive — a missing bridge leaves a disabled trigger rather than breaking the
 * shell.
 */
import { createElement as h, useEffect, useMemo, useState } from "react";
import { IconChevronDownOutlineRegular, Menu } from "@deepseek-ai/dsh-client-ui-primitives";

const BASE = "/api/infinite-story";

interface Binding {
  enabled?: boolean;
  storyId?: string | null;
}
interface StatePayload {
  binding?: Binding;
  stories?: string[];
}

function sessionOf(props: any): string {
  const candidates = [props?.sessionId, props?.session?.id, props?.session?.sessionId, props?.id];
  for (const c of candidates) if (typeof c === "string" && c) return c;
  return "default";
}

function StorySelect(props: any): unknown {
  const session = sessionOf(props);
  const [binding, setBinding] = useState<Binding | null>(null);
  const [stories, setStories] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${BASE}/state?session=${encodeURIComponent(session)}`)
      .then((r) =>
        r.ok ? (r.json() as Promise<StatePayload>) : Promise.reject(new Error(String(r.status))),
      )
      .then((data) => {
        if (!alive) return;
        setBinding(data.binding ?? { enabled: false, storyId: null });
        setStories(Array.isArray(data.stories) ? data.stories : []);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setBinding({ enabled: false, storyId: null });
      });
    return () => {
      alive = false;
    };
  }, [session]);

  const enabled = Boolean(binding?.enabled);
  const story = binding?.storyId ?? null;

  const items = useMemo(() => {
    const rows: Array<{ id: string; label: unknown }> = [{ id: "off", label: "关闭故事模式" }];
    for (const id of stories) rows.push({ id: `on:${id}`, label: `开启 · ${id}` });
    if (stories.length === 0) rows.push({ id: "none", label: "（工作区里还没有故事）" });
    return rows;
  }, [stories]);

  const selectedId = enabled && story ? `on:${story}` : "off";

  const choose = async (id: string) => {
    setOpen(false);
    if (busy || id === "none") return;
    const next = id.startsWith("on:");
    const body = next
      ? { session, action: "on", storyId: id.slice(3) }
      : { session, action: "off" };
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/mode`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { enabled?: boolean; storyId?: string };
      setBinding({ enabled: Boolean(data.enabled), storyId: data.storyId ?? story });
    } catch {
      /* leave the previous state; the next open re-reads it */
    } finally {
      setBusy(false);
    }
  };

  const label = failed ? "故事 —" : enabled ? "故事 · 开" : "故事 · 关";

  const trigger = h(
    "button",
    {
      type: "button",
      "aria-label": "故事模式",
      "aria-haspopup": "menu",
      "aria-expanded": open,
      "data-story-mode": enabled ? "on" : "off",
      title: enabled && story ? `已绑定：${story}（仅本会话）` : "故事模式（仅本会话）",
      disabled: failed || busy,
      onClick: () => setOpen((v) => !v),
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 26,
        padding: "0 8px",
        borderRadius: 13,
        border:
          "1px solid " + (enabled ? "var(--dsh-accent, #4c8dff)" : "var(--dsh-border, #3a3a3a)"),
        background: enabled ? "rgba(76,141,255,0.14)" : "transparent",
        color: enabled ? "var(--dsh-accent, #4c8dff)" : "var(--dsh-text-secondary, #9aa0a6)",
        fontSize: 12,
        cursor: failed ? "not-allowed" : busy ? "progress" : "pointer",
        whiteSpace: "nowrap",
      },
    },
    label,
    h(IconChevronDownOutlineRegular, { width: 12, height: 12, "aria-hidden": true }),
  );

  return h(Menu, {
    open,
    items,
    selectedId,
    onSelect: choose,
    onClose: () => setOpen(false),
    side: "bottom",
    portal: true,
    anchor: trigger,
  });
}

export const inject = ["slots"];

export function apply(ctx: any): void {
  ctx.slots.inject("conversation.session.header.actions", () =>
    ctx.slots.register(
      {
        name: "conversation.session.header.actions",
        id: "story-mode",
        order: 30,
      },
      StorySelect,
    ),
  );
}
