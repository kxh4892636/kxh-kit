import { describe, expect, it } from "vitest";
import { drawNext, refillBag, shuffleBag } from "./bag.ts";

const sequence = (values: number[]): (() => number) => {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
};

describe("shuffleBag", () => {
  it("keeps every id exactly once", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const bag = shuffleBag(ids);
    expect([...bag].sort()).toEqual([...ids].sort());
    expect(ids).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("is deterministic for a given random source", () => {
    const random = sequence([0.1, 0.9, 0.4]);
    expect(shuffleBag(["a", "b", "c", "d"], random)).toEqual(
      shuffleBag(["a", "b", "c", "d"], sequence([0.1, 0.9, 0.4])),
    );
  });
});

describe("refillBag", () => {
  it("does not open with the track that just finished", () => {
    const bag = refillBag(["a", "b", "c"], "a", () => 0.99);
    expect(bag[0]).not.toBe("a");
    expect(bag).toHaveLength(3);
  });

  it("leaves a single-id bag alone", () => {
    expect(refillBag(["only"], "only")).toEqual(["only"]);
  });
});

describe("drawNext", () => {
  it("takes from the existing bag without refilling", () => {
    const result = drawNext(["a", "b"], ["a", "b", "c"], "c");
    expect(result).toEqual({ id: "a", bag: ["b"] });
  });

  it("refills when the bag is empty", () => {
    const result = drawNext([], ["a", "b"], "a", () => 0.5);
    expect(result.id).not.toBeNull();
    expect(result.bag).toHaveLength(1);
  });

  it("returns null when there is nothing to play", () => {
    expect(drawNext([], [], null)).toEqual({ id: null, bag: [] });
  });
});
