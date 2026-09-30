// matcher 运行时注册见 vitest.setup.ts。
// jest-dom 6.10/7.0 的 vitest 增强按 Assertion<T> 声明, 与 vitest 5 的 Assertion<R, T> 参数不一致,
// 且 vite-plus/test 解析到的 vitest peer 实例与本地 vitest 不同, 模块增强无法跨实例合并。
// 因此改为注入全局 Chai 命名空间: vitest 的 Assertion 通过映射类型继承 Chai.Assertion。
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// jest-dom 的 TestingLibraryMatchers 泛型占位, 只此一处需要 any。
// oxlint-disable-next-line typescript/no-explicit-any
type ISafeAny = any;

declare global {
  namespace Chai {
    interface Assertion extends TestingLibraryMatchers<ISafeAny, void> {}
    interface AsymmetricMatchersContaining extends TestingLibraryMatchers<ISafeAny, void> {}
  }
}
