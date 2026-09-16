/**
 * 不可信 json 值的收窄工具。
 *
 * host.ts 与 history-text.ts 都要用它; 放在两者下游的独立模块, 避免 host ↔ history-text 的循环导入。
 */
import type { JsonObjectLike } from "./host-contract.ts";

/** 把不可信的任意 json 值收窄为对象节点; 非对象返回 undefined。 */
export const asObject = (value: unknown): JsonObjectLike | undefined =>
  typeof value === "object" && value !== null ? (value as JsonObjectLike) : undefined;
