// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ClientContext, ClientSlotOptions } from "./contract.js";
import { apply, inject } from "./index.js";
import { resetRotationFollow, rotationFollowInstalled } from "./rotation-follow.js";
import { toolkitClientState } from "./state.js";

afterEach(() => {
  toolkitClientState.reset();
  resetRotationFollow();
  vi.unstubAllGlobals();
});

interface Registration {
  readonly options: ClientSlotOptions;
  readonly component: unknown;
}

const harness = (options: { readonly inject?: ClientContext["inject"] } = {}) => {
  const registrations: Registration[] = [];
  const injections: string[] = [];
  const effects: string[] = [];
  const ctx = {
    slots: {
      inject: (key: string, contribute: () => () => void) => {
        injections.push(key);
        contribute();
      },
      register: (options: ClientSlotOptions, component: unknown) => {
        registrations.push({ options, component });
        return () => {};
      },
    },
    get: () => undefined,
    effect: (callback: () => (() => void) | void, label?: string) => {
      effects.push(label ?? "");
      const dispose = callback();
      return typeof dispose === "function" ? dispose : () => {};
    },
    ...(options.inject === undefined ? {} : { inject: options.inject }),
  } satisfies ClientContext;
  return { ctx, registrations, injections, effects };
};

describe("client plugin entry", () => {
  it("declares the slots service and registers the sidebar trio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    const { ctx, registrations, injections } = harness();
    expect(inject).toEqual(["slots"]);
    apply(ctx);
    expect(injections).toEqual([
      "sidebar.panellist",
      "main",
      "conversation.input.right",
      "conversation.input.dock",
    ]);
    expect(registrations.map((entry) => entry.options.name)).toEqual([
      "sidebar.panellist",
      "main",
      "conversation.input.right",
      "conversation.input.dock",
    ]);
    const panellist = registrations[0]?.options;
    expect(panellist).toMatchObject({ id: "toolkit", order: 30, label: "toolkit" });
    expect(registrations[1]?.options).toMatchObject({ key: "toolkit" });
    expect(registrations[2]?.options).toMatchObject({ id: "toolkit-undo", order: 100 });
    expect(registrations[3]?.options).toMatchObject({ id: "nano-flow-notes", order: 5 });
  });

  it("publishes the host catalog so the undo button can hide itself", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          tools: [{ id: "undo-turn", title: "撤回", description: "d", enabled: false }],
        }),
      ),
    );
    const { ctx } = harness();
    apply(ctx);
    await vi.waitFor(() => expect(toolkitClientState.isEnabled("undo-turn")).toBe(false));
  });

  it("keeps the defaults when the host route is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const { ctx } = harness();
    apply(ctx);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(toolkitClientState.isEnabled("undo-turn")).toBe(true);
    toolkitClientState.reset();
  });

  it("installs the root rotation follow through the uiWorkspace injection", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    const injected: (readonly string[])[] = [];
    const workspace = {
      openSession: vi.fn(async () => undefined),
      selection: {
        getSnapshot: () => ({ sessionId: "session-1" }),
        subscribe: () => () => {},
      },
    };
    const scope = {
      get: (key: string) => (key === "uiWorkspace" ? workspace : undefined),
      effect: (callback: () => (() => void) | void) => {
        const dispose = callback();
        return typeof dispose === "function" ? dispose : () => {};
      },
    };
    const { ctx } = harness({
      inject: (dependencies, callback) => {
        injected.push([...dependencies]);
        callback(scope as unknown as ClientContext);
        return undefined;
      },
    });

    apply(ctx);

    expect(injected).toEqual([["uiWorkspace"]]);
    expect(rotationFollowInstalled()).toBe(true);
  });

  it("resets the shared store when the plugin unloads", () => {
    const { ctx, effects } = harness();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    apply(ctx);
    expect(effects).toContain("toolkit: client state");
    toolkitClientState.publish([
      { id: "undo-turn", title: "撤回", description: "d", enabled: false },
    ]);
    const dispose = ctx.effect(() => () => toolkitClientState.reset());
    dispose();
    expect(toolkitClientState.isEnabled("undo-turn")).toBe(true);
  });
});
