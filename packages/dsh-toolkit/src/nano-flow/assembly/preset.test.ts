import { describe, expect, it } from "vite-plus/test";

import { createNanoFlowPreset, nanoFlowEntryUrl, NANO_FLOW_PRESET_ID } from "./preset.js";

describe("nano-flow preset", () => {
  const preset = createNanoFlowPreset("file:///tmp/nano-flow.mjs");

  it("预设入口与本插件同一模块", () => {
    const url = nanoFlowEntryUrl("file:///pkg/dist/index.mjs");
    expect(url).toBe("file:///pkg/dist/index.mjs");
    expect(url.endsWith("/index.mjs")).toBe(true);
  });

  it("点位与预设身份", () => {
    expect(preset.id).toBe(NANO_FLOW_PRESET_ID);
    expect(preset.name).toBe("Nano Flow");
    expect(preset.order).toBe(2);
  });

  it("挂载本包的第二个入口，且不挂压缩", () => {
    const names = preset.plugins.map((row) => row.name);
    expect(names).toContain("file:///tmp/nano-flow.mjs");
    expect(names.some((name) => name.includes("compaction"))).toBe(false);
    expect(names.some((name) => name.includes("tool-todo"))).toBe(false);
    expect(names.some((name) => name.includes("plan-mode"))).toBe(false);
  });

  it("挂载定时任务工具，供 dream 任务创建", () => {
    const names = preset.plugins.map((row) => row.name);
    expect(names).toContain("@deepseek-ai/dsh-tool-schedule");
  });

  it("直接挂 PTC 执行器（需要宿主的 code runtime）", () => {
    const executor = preset.plugins.find((row) => row.id === "tool-executor-ptc");
    expect(executor?.name).toBe("@deepseek-ai/dsh-tool-executor-ptc");
    expect(executor?.config).toBeUndefined();
    const names = preset.plugins.map((row) => row.name);
    expect(names).not.toContain("@deepseek-ai/dsh-agent-tool-presentation");
  });

  it("delegation 是带子行的 group", () => {
    const delegation = preset.plugins.find((row) => row.id === "delegation");
    expect(delegation?.group).toBe(true);
    expect(delegation?.isolate).toEqual({ workflowEngine: true });
    expect(Array.isArray(delegation?.config)).toBe(true);
    const children = delegation?.config as { id: string }[];
    expect(children.map((row) => row.id)).toEqual([
      "tool-subagent-control",
      "tool-subagent",
      "tool-subagent-fork",
    ]);
  });
});
