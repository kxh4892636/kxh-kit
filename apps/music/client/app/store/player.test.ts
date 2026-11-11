import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};

// zustand's persist resolves `window.localStorage`, so the node test env needs both.
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", { localStorage: storage });

const { resetPlayer, usePlayerStore } = await import("./player.ts");

beforeEach(() => {
  resetPlayer();
  store.clear();
});

describe("player store", () => {
  it("starts with a shuffled bag and a current track", () => {
    usePlayerStore.getState().start(["a", "b", "c"]);
    const state = usePlayerStore.getState();
    expect(state.bag).toHaveLength(3);
    expect(state.currentId).toBe(state.bag[0]);
  });

  it("advances through the bag and refills when empty", () => {
    usePlayerStore.getState().start(["a", "b", "c"]);
    const first = usePlayerStore.getState().currentId;
    const second = usePlayerStore.getState().advance(["a", "b", "c"]);
    expect(second).not.toBe(first);
    usePlayerStore.getState().advance(["a", "b", "c"]);
    const third = usePlayerStore.getState().advance(["a", "b", "c"]);
    expect(third).not.toBeNull();
  });

  it("records a play once and trims to the cap", () => {
    const { commitPlayed } = usePlayerStore.getState();
    for (let index = 0; index < 20; index += 1) {
      commitPlayed(`t${index}`, index);
    }
    const { history } = usePlayerStore.getState();
    expect(history).toHaveLength(13);
    expect(history[0]?.id).toBe("t19");
    commitPlayed("t19", 99);
    expect(usePlayerStore.getState().history[0]?.at).toBe(99);
    expect(usePlayerStore.getState().history.filter((entry) => entry.id === "t19")).toHaveLength(1);
  });

  it("starts with no sleep timer and persists history only", () => {
    expect(usePlayerStore.getState().timer).toEqual({ kind: "off" });
    usePlayerStore.getState().startCountdown(30, 1000);
    expect(usePlayerStore.getState().timer).toEqual({
      kind: "until",
      endsAt: 1000 + 1_800_000,
      totalMs: 1_800_000,
    });
    // The timer is session state: what reaches storage is history alone.
    const saved = JSON.parse(store.get("musopen.listen.v1") ?? "{}") as {
      state?: Record<string, unknown>;
    };
    expect(saved.state).toEqual({ history: [] });
  });

  it("expires a countdown at its deadline and leaves endless alone", () => {
    const { startCountdown, startEndless, expireTimer } = usePlayerStore.getState();
    startEndless();
    expireTimer(9e15);
    expect(usePlayerStore.getState().timer.kind).toBe("endless");

    startCountdown(1, 0);
    expireTimer(59_999);
    expect(usePlayerStore.getState().timer.kind).toBe("until");
    expireTimer(60_000);
    expect(usePlayerStore.getState().timer).toEqual({ kind: "off" });
  });

  it("drops a committed track from the bag", () => {
    usePlayerStore.getState().start(["a", "b"]);
    const current = usePlayerStore.getState().currentId;
    if (!current) throw new Error("没有当前曲目");
    usePlayerStore.getState().commitPlayed(current);
    expect(usePlayerStore.getState().bag).not.toContain(current);
  });
});
