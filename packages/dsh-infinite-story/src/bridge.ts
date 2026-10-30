import type { SessionBinding } from "./store.js";
type Ctx = any;

/**
 * HTTP bridge for the GUI switch.
 *
 * The browser cannot touch the filesystem, so the switch talks to the host:
 *
 *   GET  /api/infinite-story/state?session=<id>
 *   POST /api/infinite-story/mode   { session, action: "on"|"off", storyId? }
 *
 * Everything is best-effort: a missing webserver, a malformed body, or an
 * unknown session answers with a small JSON payload instead of throwing.
 */

export interface ServerDeps {
  workspace: () => string;
  ctx: Ctx;
  /** Enable/disable a session's prompt section, keyed by session id. */
  setSection: (session: string, enabled: boolean) => void;
  readBinding: (session: string) => Promise<SessionBinding>;
  writeBinding: (
    session: string,
    next: { enabled: boolean; storyId: string | null },
  ) => Promise<void>;
  listStories: () => Promise<string[]>;
}

const BASE = "/api/infinite-story";
const SESSION_HEADER = "x-dsh-session-id";

function json(res: any, code: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req: any, limit = 8 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sessionOf(req: any, url: URL): string {
  const fromQuery = url.searchParams.get("session");
  if (fromQuery) return fromQuery;
  const fromHeader = req.headers?.[SESSION_HEADER];
  if (typeof fromHeader === "string" && fromHeader) return fromHeader;
  return "";
}

export function registerBridge(deps: ServerDeps): () => void {
  const server = (deps.ctx as any).webServer;
  if (!server || typeof server.register !== "function") {
    return () => {};
  }

  const disposers: Array<() => void> = [];

  disposers.push(
    server.register({
      kind: "prefix",
      path: BASE,
      handler: async (req: any, res: any) => {
        try {
          const url = new URL(req.url ?? BASE, "http://localhost");
          const tail = url.pathname.slice(BASE.length);

          if (req.method === "GET" && tail === "/state") {
            const session = sessionOf(req, url);
            if (!session) return json(res, 400, { error: "missing session" });
            const binding = await deps.readBinding(session);
            const stories = await deps.listStories();
            return json(res, 200, { session, binding, stories });
          }

          if (req.method === "POST" && tail === "/mode") {
            const raw = await readBody(req);
            let body: { session?: string; action?: string; storyId?: string } = {};
            try {
              body = JSON.parse(raw || "{}");
            } catch {
              return json(res, 400, { error: "invalid json" });
            }
            const session = body.session || sessionOf(req, url);
            if (!session) return json(res, 400, { error: "missing session" });

            if (body.action === "off") {
              await deps.writeBinding(session, { enabled: false, storyId: body.storyId ?? null });
              deps.setSection(session, false);
              return json(res, 200, { ok: true, enabled: false });
            }

            if (body.action === "on") {
              const stories = await deps.listStories();
              const storyId = body.storyId ?? stories[0];
              if (!storyId || !stories.includes(storyId)) {
                return json(res, 400, { error: "unknown story", stories });
              }
              await deps.writeBinding(session, { enabled: true, storyId });
              deps.setSection(session, true);
              return json(res, 200, { ok: true, enabled: true, storyId });
            }

            return json(res, 400, { error: "unknown action" });
          }

          return json(res, 404, { error: "not found" });
        } catch (error) {
          return json(res, 500, { error: String((error as Error)?.message ?? error) });
        }
      },
    }),
  );

  return () => {
    for (const d of disposers.splice(0)) {
      try {
        d();
      } catch {
        /* already gone */
      }
    }
  };
}
