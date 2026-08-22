/** 行数低于阈值时保留原始全量渲染路径。 */
export const VIRTUALIZED_LINE_THRESHOLD = 200;

/** 行级列表在视口上下额外挂载的行数。 */
export const VIRTUALIZED_LINE_OVERSCAN = 30;

/** 文件内 chunk 列表在视口上下额外挂载的 chunk 数。 */
export const VIRTUALIZED_CHUNK_OVERSCAN = 2;

/** 代码行高度估计，挂载后由虚拟器动态校正。 */
export const ESTIMATED_CODE_ROW_HEIGHT = 21;
export const ESTIMATED_COMMENT_ROW_HEIGHT = 120;
export const ESTIMATED_COMMENT_FORM_HEIGHT = 240;
export const ESTIMATED_EXPAND_CONTROL_HEIGHT = 36;
