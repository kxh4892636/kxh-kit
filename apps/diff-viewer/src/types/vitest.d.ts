/* oxlint-disable typescript/no-explicit-any */
// jest-dom 6.9+ 自带对 vitest 的模块增强, 上游遗留的 jest.Matchers 接口扩展
// 在 vitest 4.1 类型下会冲突 (TS2320), 故裁剪掉; matcher 运行时注册见 vitest.setup.ts
import "@testing-library/jest-dom";
import "vitest";
