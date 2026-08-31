/**
 * CJK 字符切分归一（供 FTS 写入与查询同构使用）。
 *
 * 对每个 Han 字符两侧插入空格（相邻汉字间为双空格），并整体 lowercase。
 * 经 FTS5 unicode61 分词后（空白连续段折叠），每个汉字成为独立 token，
 * 中文查询按相同归一传入 MATCH 即可命中（如「记忆」→ ` 记  忆 `）。
 */
export const cjkTokenize = (text: string): string =>
  text.replace(/\p{Script=Han}/gu, (char) => ` ${char} `).toLowerCase();
