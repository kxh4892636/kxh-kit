import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vite-plus/test";
import { TOOLKIT_STATE_PATH } from "./contract.js";

/** 插件入口测试的宿主替身与装配工具；与用例分开，避免单文件超过体量上限。 */
export interface HarnessOptions {
  readonly connection?: boolean;
  readonly sessionControl?: boolean;
  readonly getThrows?: boolean;
  /** 存活会话的 cwd；用于 Note 面板路由。 */
  readonly notesSession?: {
    readonly id: string;
    readonly cwd: string;
  };
  /** 归档集合里已有这些 id；`stored` 是有日志的，`live` 是仍存活的。 */
  readonly archiveSweep?: {
    readonly archived: readonly string[];
    readonly stored: readonly string[];
    readonly live: readonly string[];
  };
  /** 持久化里还有日志的会话 id；用于绑定表的死条目回收。`fail` 让 `list()` 抛错。 */
  readonly persistence?: {
    readonly stored: readonly string[];
    readonly fail?: boolean;
  };
  /** 仍存活、但可能还没有日志的会话 id。 */
  readonly liveSessions?: readonly string[];
}

export interface Harness {
  readonly ctx: Record<string, unknown>;
  readonly routes: Map<string, (request: Request) => Promise<Response>>;
  readonly providerNames: string[];
  readonly disposers: (() => void)[];
  readonly archived: string[];
  readonly unarchived: string[];
  readonly pinned: string[];
  readonly inserted: { sessionId: string; before: string | undefined }[];
  readonly emitted: (readonly [string, ...unknown[]])[];
  readonly warns: ReturnType<typeof vi.fn>;
  /** `ctx.provide` 提供的服务，按名字取。 */
  readonly provided: Record<string, unknown>;
}

/** 测试里可观察的宿主副作用（归档、置顶、记账顺序）。 */
export interface HostFixture {
  readonly archived: string[];
  readonly unarchived: string[];
  readonly pinned: string[];
  readonly inserted: { sessionId: string; before: string | undefined }[];
}

/** 会话控制与工作区替身：undo 与归档清扫用。 */
export const applySessionControl = (
  options: HarnessOptions,
  services: Record<string, unknown>,
  fixture: HostFixture,
): void => {
  if (options.sessionControl !== true && options.archiveSweep === undefined) return;
  services["sessions"] = {
    get: () => ({
      snapshotEvents: () => [
        { type: "turn/start", seq: 0 },
        { type: "user/message", seq: 1, data: { content: [{ type: "text", text: "one" }] } },
        { type: "turn/end", seq: 2 },
        { type: "turn/start", seq: 3 },
        { type: "user/message", seq: 4, data: { content: [{ type: "text", text: "two" }] } },
      ],
    }),
  };
  services["sessionController"] = {
    fork: async () => ({ sessionId: "session-child" }),
  };
  services["workspaceRegistry"] = {
    list: () => [
      {
        sessionIds: ["session-source", "session-after"],
        insertSessionBefore: async (sessionId: string, before: string | undefined) => {
          fixture.inserted.push({ sessionId, before });
        },
        detachSession: async () => {},
      },
    ],
    archivedSessionIds: [...(options.archiveSweep?.archived ?? [])],
    get pinnedSessionIds() {
      return [...fixture.pinned];
    },
    unarchiveSession: async (sessionId: string) => {
      fixture.unarchived.push(sessionId);
    },
    archiveSession: async (sessionId: string) => {
      fixture.archived.push(sessionId);
      const index = fixture.pinned.indexOf(sessionId);
      if (index >= 0) fixture.pinned.splice(index, 1);
    },
    pinSession: async (sessionId: string) => {
      if (!fixture.pinned.includes(sessionId)) fixture.pinned.unshift(sessionId);
    },
    unpinSession: async (sessionId: string) => {
      const index = fixture.pinned.indexOf(sessionId);
      if (index >= 0) fixture.pinned.splice(index, 1);
    },
  };
};

/** 归档清扫与绑定回收的持久化替身；最后装配，覆盖更早的替身。 */
export const applyPersistence = (
  options: HarnessOptions,
  services: Record<string, unknown>,
): void => {
  if (options.archiveSweep !== undefined) {
    services["sessions"] = {
      get: (id: string) => (options.archiveSweep?.live.includes(id) === true ? {} : undefined),
    };
    services["sessionPersistence"] = {
      list: async () =>
        (options.archiveSweep?.stored ?? []).map((id: string) => ({ header: { id } })),
    };
  }
  if (options.persistence !== undefined) {
    services["sessionPersistence"] = {
      list: async () => {
        if (options.persistence?.fail === true) throw new Error("list failed");
        return (options.persistence?.stored ?? []).map((id: string) => ({ header: { id } }));
      },
    };
  }
  if (options.liveSessions !== undefined) {
    const live = new Set(options.liveSessions);
    services["sessions"] = {
      get: (id: string) => (live.has(id) ? { header: {} } : undefined),
    };
  }
};

export const makeHarness = (options: HarnessOptions = {}): Harness => {
  const routes = new Map<string, (request: Request) => Promise<Response>>();
  const providerNames: string[] = [];
  const disposers: (() => void)[] = [];
  const fixture: HostFixture = { archived: [], unarchived: [], pinned: [], inserted: [] };
  const { archived, unarchived, pinned, inserted } = fixture;
  const services: Record<string, unknown> = {
    connection:
      options.connection === false
        ? undefined
        : {
            fetch: {
              register: (route: {
                path: string;
                fetch: (request: Request) => Promise<Response>;
              }) => {
                routes.set(route.path, route.fetch);
                return () => routes.delete(route.path);
              },
            },
          },
  };
  if (options.notesSession !== undefined) {
    services["sessions"] = {
      get: (id: string) =>
        id === options.notesSession?.id ? { header: { cwd: options.notesSession.cwd } } : undefined,
    };
  }
  applySessionControl(options, services, fixture);
  applyPersistence(options, services);
  const warns = vi.fn();
  const emitted: (readonly [string, ...unknown[]])[] = [];
  const provided: Record<string, unknown> = {};
  const ctx: Record<string, unknown> = {
    logger: { warn: warns, info: vi.fn() },
    provide: (key: string, value: unknown) => {
      provided[key] = value;
      return () => {
        delete provided[key];
      };
    },
    emit: (event: string, ...args: unknown[]) => {
      emitted.push([event, ...args]);
    },
    get: (key: string) => {
      if (options.getThrows === true) throw new Error("no service access");
      return services[key];
    },
    effect: (callback: () => (() => void) | void) => {
      const dispose = callback();
      if (typeof dispose === "function") disposers.push(dispose);
      return () => {};
    },
    inject: (_deps: string[], callback: (child: unknown) => void) => {
      callback(ctx);
    },
    on: () => () => {},
    skills: {
      registerProvider: (
        create: (control: { signal: AbortSignal; invalidate: () => void }) => {
          name: string;
          dispose?: () => Promise<void>;
        },
      ) => {
        const provider = create({ signal: new AbortController().signal, invalidate: () => {} });
        providerNames.push(provider.name);
        return () => {
          providerNames.splice(providerNames.indexOf(provider.name), 1);
        };
      },
    },
  };
  return {
    ctx,
    routes,
    providerNames,
    disposers,
    archived,
    pinned,
    inserted,
    unarchived,
    emitted,
    warns,
    provided,
  };
};

export const workspaces: string[] = [];

export const tempDir = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), "dsh-toolkit-"));
  workspaces.push(path);
  return path;
};

export const post = (path: string, body: unknown): Request => {
  return new Request(`http://127.0.0.1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
};

/** 工具默认全部关闭：测试里先显式打开再用。 */
export const enable = async (
  routes: Map<string, (request: Request) => Promise<Response>>,
  id: string,
): Promise<void> => {
  await routes.get(TOOLKIT_STATE_PATH)?.(post(TOOLKIT_STATE_PATH, { id, enabled: true }));
};
