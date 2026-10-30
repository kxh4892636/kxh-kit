/**
 * Client plugin: the story-mode switch in the session header.
 *
 * Loaded by the web client as a `window.__ModuleLoader__` module. It talks to
 * the host through the `/api/infinite-story` bridge; everything is defensive so
 * a missing bridge degrades to a dimmed button rather than breaking the shell.
 */
import { createElement as h, useEffect, useState } from "react";

const BASE = "/api/infinite-story";

interface StatePayload {
  binding?: { enabled?: boolean; storyId?: string | null };
}

function sessionOf(props: any): string {
  const candidates = [props?.sessionId, props?.session?.id, props?.session?.sessionId, props?.id];
  for (const c of candidates) if (typeof c === "string" && c) return c;
  return "default";
}

function StorySwitch(props: any): unknown {
  const session = sessionOf(props);
  const [on, setOn] = useState<boolean | null>(null);
  const [story, setStory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${BASE}/state?session=${encodeURIComponent(session)}`)
      .then((r) => (r.ok ? (r.json() as Promise<StatePayload>) : null))
      .then((data) => {
        if (!alive || !data?.binding) return;
        setOn(Boolean(data.binding.enabled));
        setStory(data.binding.storyId ?? null);
      })
      .catch(() => alive && setOn(false));
    return () => {
      alive = false;
    };
  }, [session]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = !on;
      const res = await fetch(`${BASE}/mode`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session, action: next ? "on" : "off" }),
      });
      if (res.ok) {
        const data = (await res.json()) as { enabled?: boolean; storyId?: string };
        setOn(Boolean(data.enabled));
        if (data.storyId) setStory(data.storyId);
      }
    } catch {
      /* keep the old state; the host will answer on the next click */
    } finally {
      setBusy(false);
    }
  };

  const label = on === null ? "故事 …" : on ? "故事 ●" : "故事 ○";

  return h(
    "button",
    {
      type: "button",
      onClick: toggle,
      title: on ? `故事模式已开启${story ? ` · ${story}` : ""}` : "开启故事模式（仅本会话）",
      "data-story-mode": on ? "on" : "off",
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 24,
        padding: "0 8px",
        marginRight: 4,
        borderRadius: 12,
        border: "1px solid " + (on ? "var(--dsh-accent, #4c8dff)" : "var(--dsh-border, #3a3a3a)"),
        background: on ? "rgba(76,141,255,0.14)" : "transparent",
        color: on ? "var(--dsh-accent, #4c8dff)" : "var(--dsh-text-secondary, #9aa0a6)",
        fontSize: 12,
        cursor: busy ? "progress" : "pointer",
        whiteSpace: "nowrap",
      },
    },
    label,
  );
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
      StorySwitch,
    ),
  );
}
