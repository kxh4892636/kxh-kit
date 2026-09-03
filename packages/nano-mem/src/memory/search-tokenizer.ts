export const SEARCH_TOKENIZER_VERSION = 1;

const cjkRuns = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
const wordRuns = /[\p{L}\p{N}]+/gu;

const addCjkNgrams = (tokens: Set<string>, run: string): void => {
  const characters = Array.from(run);
  for (let size = 1; size <= 3; size += 1) {
    for (let start = 0; start + size <= characters.length; start += 1) {
      tokens.add(characters.slice(start, start + size).join(""));
    }
  }
};

const camelSegments = (text: string): string =>
  text.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2").replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2");

export const tokenizeSearchText = (text: string): readonly string[] => {
  const normalized = text.normalize("NFKC");
  const tokens = new Set<string>();
  for (const match of normalized.matchAll(cjkRuns)) addCjkNgrams(tokens, match[0].toLowerCase());
  const nonCjkText = normalized.replace(cjkRuns, " ");
  for (const match of nonCjkText.toLowerCase().matchAll(wordRuns)) tokens.add(match[0]);
  for (const match of camelSegments(nonCjkText).toLowerCase().matchAll(wordRuns)) {
    tokens.add(match[0]);
  }
  return [...tokens];
};

export const toSearchTerms = (text: string): string => tokenizeSearchText(text).join(" ");

export interface SearchQueryPlan {
  flatMatchQuery: string;
  groupMatchQueries: readonly string[];
}

const quoteMatchTerm = (term: string): string => `"${term.replaceAll('"', '""')}"`;

const toMatchQuery = (tokens: readonly string[], operator: "AND" | "OR"): string =>
  tokens.map(quoteMatchTerm).join(` ${operator} `);

export const toFtsMatchQuery = (text: string): string | undefined => {
  const tokens = tokenizeSearchText(text);
  return tokens.length === 0 ? undefined : toMatchQuery(tokens, "AND");
};

export const toSearchQueryPlan = (text: string): SearchQueryPlan | undefined => {
  const words = text.split(/\s+/u);
  const groupTokens = new Map<string, readonly string[]>();
  for (const word of words) {
    const tokens = tokenizeSearchText(word);
    if (tokens.length === 0) continue;
    const key = [...tokens].sort().join("\u0000");
    if (!groupTokens.has(key)) groupTokens.set(key, tokens);
  }
  if (groupTokens.size === 0) return undefined;
  const groups = [...groupTokens.values()];
  const flatTokens = [...new Set(groups.flat())];
  return {
    flatMatchQuery: toMatchQuery(flatTokens, "OR"),
    groupMatchQueries: groups.map((tokens: readonly string[]): string =>
      toMatchQuery(tokens, "AND"),
    ),
  };
};
