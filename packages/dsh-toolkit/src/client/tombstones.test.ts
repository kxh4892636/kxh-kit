// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  clearTombstones,
  guardTombstones,
  hideSessionRow,
  rememberTombstone,
  tombstones,
  type SessionCatalogLike,
} from "./tombstones.js";

afterEach(() => {
  clearTombstones();
});

const catalogWith = (ids: readonly string[]) => {
  let current = [...ids];
  const listeners: (() => void)[] = [];
  const removed: string[] = [];
  const catalog: SessionCatalogLike & { set(next: readonly string[]): void } = {
    handleSessionRemoved(sessionId: string) {
      removed.push(sessionId);
      current = current.filter((id) => id !== sessionId);
      for (const listener of listeners) listener();
    },
    list: {
      getSnapshot: () => ({ ids: current }),
      subscribe: (listener: () => void) => {
        listeners.push(listener);
        return () => {};
      },
    },
    set(next: readonly string[]) {
      current = [...next];
      for (const listener of listeners) listener();
    },
  };
  return { catalog, removed };
};

describe("tombstones", () => {
  it("remembers ids once and keeps them across reads", () => {
    rememberTombstone("session-a");
    rememberTombstone("session-a");
    rememberTombstone("session-b");
    expect(tombstones()).toEqual(["session-a", "session-b"]);
  });

  it("survives a fresh module read (storage backed)", () => {
    rememberTombstone("session-a");
    expect(JSON.parse(localStorage.getItem("dshtk.tombstones.v1") ?? "[]")).toEqual(["session-a"]);
  });

  it("hides a row through the host's own removal hook", () => {
    const { catalog, removed } = catalogWith(["session-a", "session-b"]);
    expect(hideSessionRow(catalog, "session-a")).toBe(true);
    expect(removed).toEqual(["session-a"]);
  });

  it("reports false when the host exposes no removal hook", () => {
    expect(hideSessionRow({}, "session-a")).toBe(false);
  });

  it("re-hides rows that the catalog lists again on refresh", () => {
    const { catalog, removed } = catalogWith([]);
    rememberTombstone("session-a");
    guardTombstones(catalog);
    // 宿主刷新目录后，「已删除」的会话又回来了。
    catalog.set(["session-a", "session-b"]);
    expect(removed).toEqual(["session-a"]);
  });

  it("ignores ids that are not tombstoned", () => {
    const { catalog, removed } = catalogWith([]);
    guardTombstones(catalog);
    catalog.set(["session-b"]);
    expect(removed).toEqual([]);
  });

  it("installs the guard only once per catalog", () => {
    const { catalog, removed } = catalogWith([]);
    rememberTombstone("session-a");
    guardTombstones(catalog);
    guardTombstones(catalog);
    catalog.set(["session-a"]);
    expect(removed).toEqual(["session-a"]);
  });

  it("tolerates a catalog without a list store", () => {
    rememberTombstone("session-a");
    expect(() => guardTombstones(undefined)).not.toThrow();
    expect(() => guardTombstones({})).not.toThrow();
  });

  it("keeps working when storage is unavailable", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => rememberTombstone("session-a")).not.toThrow();
    expect(tombstones()).toEqual([]);
    spy.mockRestore();
  });
});
