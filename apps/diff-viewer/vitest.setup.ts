import "@testing-library/jest-dom";
import { vi } from "vitest";

// oxlint-disable-next-line typescript/no-explicit-any -- mock 数据形状各异, 有意放开的 any
type ISafeAny = any;

// 组件测试全局 mock fetch; server 集成测试在上游存在, 本包不涉及 (主进程逻辑直接测路由函数)
global.fetch = vi.fn();

// 抑制测试期间的 error 日志输出
global.console.error = vi.fn();

// 组件 effect 依赖 getComputedStyle, 单测环境 mock 为恒空实现
Object.defineProperty(window, "getComputedStyle", {
  value: () => ({
    getPropertyValue: () => "",
  }),
});

// 全局测试工具
export const mockFetch = (response: ISafeAny, revisionsResponse?: ISafeAny) => {
  (global.fetch as ISafeAny).mockImplementation((url: string) => {
    // /api/revisions 单独可配, 其余默认按 /api/diff 处理
    if (url.includes("/api/revisions")) {
      return Promise.resolve({
        ok: revisionsResponse !== null,
        json: async () =>
          revisionsResponse ?? {
            specialOptions: [],
            branches: [],
            commits: [],
          },
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => response,
      blob: async () => ({ size: 1024 }),
    });
  });
};

export const mockFetchError = (error: string) => {
  (global.fetch as ISafeAny).mockRejectedValue(new Error(error));
};
