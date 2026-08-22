/**
 * 行级虚拟列表的阈值与尺寸估计。
 * 行数低于阈值的 chunk 走原始全量渲染路径, 行为与引入虚拟化之前完全一致。
 */
export const VIRTUALIZED_CHUNK_ROW_THRESHOLD = 200;

/** 视口上下额外挂载的行数, 保证小幅滚动与 hover/拖拽交互的连续性 */
export const VIRTUALIZED_CHUNK_OVERSCAN = 30;

/** 代码行高度估计 (font-mono text-sm leading-5), 挂载后由 measureElement 动态校正 */
export const ESTIMATED_CODE_ROW_HEIGHT = 21;
export const ESTIMATED_COMMENT_ROW_HEIGHT = 120;
export const ESTIMATED_COMMENT_FORM_HEIGHT = 240;
