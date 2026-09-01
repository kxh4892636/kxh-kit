import { describe, expect, test } from "vitest";
import {
  SEARCH_TOKENIZER_VERSION,
  toFtsMatchQuery,
  tokenizeSearchText,
} from "./search-tokenizer.js";

describe("search tokenizer", (): void => {
  test("normalizes text and emits one-to-three character CJK ngrams", (): void => {
    expect(SEARCH_TOKENIZER_VERSION).toBe(1);
    expect(tokenizeSearchText("ＡＢＣ 使用cachePolicy读取缓存策略")).toEqual(
      expect.arrayContaining([
        "abc",
        "使",
        "使用",
        "cachepolicy",
        "cache",
        "policy",
        "读取",
        "缓存",
        "缓存策",
        "策略",
      ]),
    );
  });

  test("segments identifiers, file names, paths, and extensions", (): void => {
    const tokens = tokenizeSearchText("src/getUserProfile/user_cache/nano-mem.test.ts");
    expect(tokens).toEqual(
      expect.arrayContaining([
        "src",
        "getuserprofile",
        "get",
        "user",
        "profile",
        "cache",
        "nano",
        "mem",
        "test",
        "ts",
      ]),
    );
  });

  test("turns operators and punctuation into quoted literal terms", (): void => {
    expect(toFtsMatchQuery('OR title:"x" -drop (table);')).toBe(
      '"or" AND "title" AND "x" AND "drop" AND "table"',
    );
    expect(toFtsMatchQuery("---:::()")).toBeUndefined();
  });
});
