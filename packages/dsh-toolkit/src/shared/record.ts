/**
 * 判断值是否是普通对象（排除 null、数组）。
 * @param value - 外部数据（YAML、宿主事件、路由请求体）。
 * @returns 是对象时为 true。
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 取对象形状，缺失时给空对象，便于直接链式取字段。
 * @param value - 外部数据。
 * @returns 对象或空对象。
 */
export const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});
