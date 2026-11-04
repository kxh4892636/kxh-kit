import type { Context } from "@deepseek-ai/cordis";
import { describe, expect, it, vi } from "vite-plus/test";
import { ToolkitRegistry, UnknownToolError, type ToolkitTool } from "./toolkit-registry.js";
import { ToolkitStateStore, type ToolkitStateIo } from "./toolkit-state.js";

const memoryIo = (initial?: string): ToolkitStateIo => {
  let text = initial;
  return {
    async read() {
      return text;
    },
    async write(next) {
      text = next;
    },
  };
};

const makeTool = (id: string, defaultEnabled = true): ToolkitTool & { disposer: () => void } => {
  const dispose = vi.fn();
  return {
    id,
    title: id,
    description: `${id} tool`,
    defaultEnabled,
    apply: () => dispose,
    disposer: dispose,
  };
};

const logger = { warn: vi.fn() };

describe("ToolkitRegistry", () => {
  it("applies default-enabled tools on initialize", async () => {
    const on = makeTool("on");
    const off = makeTool("off", false);
    const registry = new ToolkitRegistry({
      ctx: {} as Context,
      tools: [on, off],
      store: new ToolkitStateStore(memoryIo()),
      logger,
    });
    const list = await registry.initialize();
    expect(list).toEqual([
      { id: "on", title: "on", description: "on tool", enabled: true },
      { id: "off", title: "off", description: "off tool", enabled: false },
    ]);
    expect(registry.isEnabled("on")).toBe(true);
    expect(registry.isEnabled("off")).toBe(false);
  });

  it("honors persisted switches over defaults", async () => {
    const on = makeTool("on");
    const store = new ToolkitStateStore(memoryIo('{"tools":{"on":false}}'));
    const registry = new ToolkitRegistry({ ctx: {} as Context, tools: [on], store, logger });
    const list = await registry.initialize();
    expect(list[0]?.enabled).toBe(false);
  });

  it("disposes a tool when switched off and reapplies it when switched on", async () => {
    const tool = makeTool("nested-skill");
    const registry = new ToolkitRegistry({
      ctx: {} as Context,
      tools: [tool],
      store: new ToolkitStateStore(memoryIo()),
      logger,
    });
    await registry.initialize();
    await registry.setEnabled("nested-skill", false);
    expect(tool.disposer).toHaveBeenCalledOnce();
    expect(registry.isEnabled("nested-skill")).toBe(false);

    await registry.setEnabled("nested-skill", true);
    expect(registry.isEnabled("nested-skill")).toBe(true);
    await registry.dispose();
    expect(tool.disposer).toHaveBeenCalledTimes(2);
  });

  it("is a no-op when the requested state already holds", async () => {
    const tool = makeTool("a");
    const registry = new ToolkitRegistry({
      ctx: {} as Context,
      tools: [tool],
      store: new ToolkitStateStore(memoryIo()),
      logger,
    });
    await registry.initialize();
    await registry.setEnabled("a", true);
    expect(tool.disposer).not.toHaveBeenCalled();
  });

  it("rejects unknown tool ids", async () => {
    const registry = new ToolkitRegistry({
      ctx: {} as Context,
      tools: [makeTool("a")],
      store: new ToolkitStateStore(memoryIo()),
      logger,
    });
    await registry.initialize();
    await expect(registry.setEnabled("nope", true)).rejects.toBeInstanceOf(UnknownToolError);
  });

  it("keeps the registry usable when a tool throws", async () => {
    const broken: ToolkitTool = {
      id: "broken",
      title: "broken",
      description: "throws",
      defaultEnabled: true,
      apply: () => {
        throw new Error("boom");
      },
    };
    const registry = new ToolkitRegistry({
      ctx: {} as Context,
      tools: [broken],
      store: new ToolkitStateStore(memoryIo()),
      logger,
    });
    await expect(registry.initialize()).resolves.toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('tool "broken" failed to apply'),
    );
  });
});
