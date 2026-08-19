// 牌组层级工具(自上游 deck-hierarchy.utils.ts 移植)。
// 调度器的父牌组计数是对全部子孙的上卷; total_in_deck 则只计直接存放的卡片,
// 因此按子树求和保持算术一致(total >= new + learning + review 通常成立)。

// deck 名以 `ancestor::` 开头即为子孙(含孙辈及更深)。
export function isDescendantOf(deckName: string, ancestor: string): boolean {
  return deckName.startsWith(`${ancestor}::`);
}

// 根牌组名(不含 ::): 其计数已上卷全部子孙, 只对根求和即得真实集合总数。
export function getRootDeckNames(allDeckNames: readonly string[]): string[] {
  return allDeckNames.filter((name) => !name.includes("::"));
}

// 某牌组的上卷 total = 自身 total_in_deck + 全部子孙的 total_in_deck。
export function rollupDeckTotal(
  deckName: string,
  perDeckOwnTotal: ReadonlyMap<string, number>,
): number {
  let sum = perDeckOwnTotal.get(deckName) ?? 0;
  for (const [name, total] of perDeckOwnTotal) {
    if (isDescendantOf(name, deckName)) {
      sum += total;
    }
  }
  return sum;
}
