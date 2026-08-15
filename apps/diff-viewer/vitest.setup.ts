import "@testing-library/jest-dom";
import { vi } from "vitest";

// 组件测试全局 mock fetch; server 集成测试在上游存在, 本包不涉及 (主进程逻辑直接测路由函数)
global.fetch = vi.fn();

// Mock console.error to suppress error logs during tests
global.console.error = vi.fn();

// Mock window.getComputedStyle
Object.defineProperty(window, "getComputedStyle", {
  value: () => ({
    getPropertyValue: () => "",
  }),
});

// Global test utilities
export const mockFetch = (response: any, revisionsResponse?: any) => {
  (global.fetch as any).mockImplementation((url: string) => {
    // Handle /api/revisions endpoint
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
    // Default: /api/diff and others
    return Promise.resolve({
      ok: true,
      json: async () => response,
      blob: async () => ({ size: 1024 }),
    });
  });
};

export const mockFetchError = (error: string) => {
  (global.fetch as any).mockRejectedValue(new Error(error));
};
