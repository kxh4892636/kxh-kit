export const shuffleBag = (
  ids: readonly string[],
  random: () => number = Math.random,
): string[] => {
  const out = [...ids];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap] as string, out[index] as string];
  }
  return out;
};

/**
 * Fill the bag when it runs dry, and make sure the reshuffled bag does not open
 * with the track that just finished.
 */
export const refillBag = (
  ids: readonly string[],
  lastId: string | null,
  random: () => number = Math.random,
): string[] => {
  const bag = shuffleBag(ids, random);
  if (bag.length > 1 && bag[0] === lastId) {
    [bag[0], bag[1]] = [bag[1] as string, bag[0] as string];
  }
  return bag;
};

export interface DrawResult {
  id: string | null;
  bag: string[];
}

export const drawNext = (
  bag: readonly string[],
  ids: readonly string[],
  lastId: string | null,
  random: () => number = Math.random,
): DrawResult => {
  const ready = bag.length > 0 ? [...bag] : refillBag(ids, lastId, random);
  const id = ready.shift() ?? null;
  return { id, bag: ready };
};
