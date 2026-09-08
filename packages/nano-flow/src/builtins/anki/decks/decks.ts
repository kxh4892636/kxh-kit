import type { JsonValue } from "../../../cli/types";
import { AnkiOperationError } from "../errors";
import type { Logger } from "../logger";
import type { AnkiPort } from "../port";
import {
  nullResponse,
  numberArrayResponse,
  parseResponse,
  stringArrayResponse,
} from "../responses";
import { deckScopeQuery } from "./deck-metrics";

const stringArray = (value: unknown, action: string): readonly string[] => {
  if (
    !Array.isArray(value) ||
    !value.every((entry: unknown): entry is string => typeof entry === "string")
  ) {
    throw new AnkiOperationError(`Invalid ${action} response: expected string array`, action);
  }
  return value;
};

const record = (value: unknown, action: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AnkiOperationError(`Invalid ${action} response: expected object`, action);
  }
  return value as Record<string, unknown>;
};

const isJsonRecord = (value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const withHint = (error: unknown, action: string, hint: string): never => {
  const details = error instanceof AnkiOperationError ? error.details : undefined;
  // 已带 hint 的错误保留了更具体的修复指引, 不再被调用方的通用提示覆盖。
  const existing = error instanceof AnkiOperationError ? error.hint : undefined;
  throw new AnkiOperationError(error instanceof Error ? error.message : String(error), action, {
    hint: existing ?? hint,
    ...(details === undefined ? {} : { details }),
  });
};

export const listDecks = async (port: AnkiPort, includeStats: boolean): Promise<JsonValue> => {
  try {
    const names = stringArray(await port.invoke<unknown>("deckNames"), "deckNames");
    if (names.length === 0)
      return { success: true, decks: [], total: 0, message: "No decks found in Anki" };
    if (!includeStats)
      return {
        success: true,
        decks: names.map((name: string): Record<string, JsonValue> => ({ name })),
        total: names.length,
      };
    const ids = record(await port.invoke<unknown>("deckNamesAndIds", {}), "deckNamesAndIds");
    const stats = record(
      await port.invoke<unknown>("getDeckStats", { decks: names }),
      "getDeckStats",
    );
    const decks = names.map((name: string): Record<string, JsonValue> => {
      const id = ids[name];
      const rawValues = typeof id === "number" ? stats[String(id)] : undefined;
      const values = rawValues === undefined ? undefined : record(rawValues, "getDeckStats");
      return values === undefined
        ? { name }
        : {
            name,
            stats: {
              deck_id: typeof values["deck_id"] === "number" ? values["deck_id"] : 0,
              name,
              new_count: typeof values["new_count"] === "number" ? values["new_count"] : 0,
              learn_count: typeof values["learn_count"] === "number" ? values["learn_count"] : 0,
              review_count: typeof values["review_count"] === "number" ? values["review_count"] : 0,
              total_new: typeof values["new_count"] === "number" ? values["new_count"] : 0,
              total_cards:
                typeof values["total_in_deck"] === "number" ? values["total_in_deck"] : 0,
            },
          };
    });
    const rootNames = new Set(names.filter((name: string): boolean => !name.includes("::")));
    const summary = decks.reduce(
      (
        totals: {
          total_cards: number;
          new_cards: number;
          learning_cards: number;
          review_cards: number;
        },
        entry: Record<string, JsonValue>,
      ): {
        total_cards: number;
        new_cards: number;
        learning_cards: number;
        review_cards: number;
      } => {
        const entryStats = entry["stats"];
        const entryName = entry["name"];
        if (!isJsonRecord(entryStats)) return totals;
        totals.total_cards +=
          typeof entryStats["total_cards"] === "number" ? entryStats["total_cards"] : 0;
        if (typeof entryName === "string" && rootNames.has(entryName)) {
          totals.new_cards +=
            typeof entryStats["new_count"] === "number" ? entryStats["new_count"] : 0;
          totals.learning_cards +=
            typeof entryStats["learn_count"] === "number" ? entryStats["learn_count"] : 0;
          totals.review_cards +=
            typeof entryStats["review_count"] === "number" ? entryStats["review_count"] : 0;
        }
        return totals;
      },
      { total_cards: 0, new_cards: 0, learning_cards: 0, review_cards: 0 },
    );
    return { success: true, decks, total: decks.length, summary };
  } catch (error) {
    return withHint(error, "listDecks", "Make sure Anki is running");
  }
};

export const validateDeckName = (deckName: string): void => {
  const parts = deckName.split("::");
  if (parts.some((part: string): boolean => part.trim() === "")) {
    throw new Error("Deck name parts cannot be empty");
  }
};

export const createDeck = async (
  port: AnkiPort,
  deckName: string,
  logger: Logger,
): Promise<JsonValue> => {
  try {
    const parts = deckName.split("::");
    validateDeckName(deckName);
    const parentDeck = parts.slice(0, -1).join("::");
    const childDeck = parts.at(-1) ?? "";
    let parentExisted: boolean | undefined;
    if (parts.length > 1) {
      try {
        const existing = stringArray(await port.invoke<unknown>("deckNames"), "deckNames");
        parentExisted = existing.includes(parentDeck);
      } catch (error) {
        logger.warn(
          `Could not determine whether parent deck exists: ${error instanceof Error ? error.message : String(error)}`,
        );
        parentExisted = undefined;
      }
    }
    const rawDeckId: unknown = await port.invoke<unknown>("createDeck", { deck: deckName });
    if (rawDeckId !== null && typeof rawDeckId !== "number") {
      throw new AnkiOperationError(
        "Invalid createDeck response: expected number or null",
        "createDeck",
      );
    }
    const deckId = rawDeckId;
    if (!deckId) {
      const existing = stringArray(await port.invoke<unknown>("deckNames"), "deckNames");
      if (!existing.includes(deckName)) throw new Error("Failed to create deck - unknown error");
      const result: Record<string, JsonValue> = {
        success: true,
        deckName,
        created: false,
        exists: true,
        message: `Deck "${deckName}" already exists`,
      };
      if (parts.length > 1) {
        result["parentDeck"] = parentDeck;
        result["childDeck"] = childDeck;
        if (parentExisted !== undefined) result["parentExisted"] = parentExisted;
      }
      return result;
    }
    const result: Record<string, JsonValue> = {
      success: true,
      deckId,
      deckName,
      created: true,
      message: `Successfully created deck "${deckName}"`,
    };
    if (parts.length > 1) {
      result["parentDeck"] = parentDeck;
      result["childDeck"] = childDeck;
      if (parentExisted !== undefined) {
        result["parentExisted"] = parentExisted;
        result["message"] = parentExisted
          ? `Found existing parent deck "${parentDeck}"; created child deck "${childDeck}"`
          : `Created parent deck "${parentDeck}" and child deck "${childDeck}"`;
      } else {
        result["message"] = `Created child deck "${childDeck}" under parent "${parentDeck}"`;
      }
    }
    return result;
  } catch (error) {
    return withHint(error, "createDeck", "Make sure Anki is running and the deck name is valid");
  }
};

export const moveCards = async (
  port: AnkiPort,
  deck: string,
  cards: readonly number[],
): Promise<JsonValue> => {
  try {
    const trimmedDeck = deck.trim();
    if (trimmedDeck === "") throw new Error("deck name cannot be empty");
    const info: unknown = await port.invoke<unknown>("cardsInfo", { cards });
    if (!Array.isArray(info)) throw new Error("Invalid cardsInfo response: expected array");
    const invalidIds = cards.filter((_id: number, index: number): boolean => {
      const entry: unknown = info[index];
      return (
        typeof entry !== "object" ||
        entry === null ||
        !("cardId" in entry) ||
        typeof entry.cardId !== "number"
      );
    });
    if (invalidIds.length > 0) {
      const maxShown = 10;
      const shown = invalidIds.slice(0, maxShown).join(", ");
      const suffix =
        invalidIds.length > maxShown ? ` (and ${invalidIds.length - maxShown} more)` : "";
      throw new AnkiOperationError(
        `${invalidIds.length} of ${cards.length} card ID(s) do not exist in the Anki collection: [${shown}]${suffix}. No cards were moved.`,
        "changeDeck",
        { details: { invalidIds, totalRequested: cards.length } },
      );
    }
    await port.invoke<null>("changeDeck", { cards, deck: trimmedDeck });
    return {
      success: true,
      message: `Successfully moved ${cards.length} card(s) to deck "${trimmedDeck}"`,
      cardsAffected: cards.length,
      targetDeck: trimmedDeck,
    };
  } catch (error) {
    return withHint(
      error,
      "changeDeck",
      "Make sure Anki is running and the card IDs / deck name are valid",
    );
  }
};

export const deleteDeck = async (port: AnkiPort, deckName: string): Promise<JsonValue> => {
  try {
    const names = parseResponse(
      "deckNames",
      stringArrayResponse,
      await port.invoke<unknown>("deckNames"),
    );
    if (names === null || !names.includes(deckName)) {
      throw new AnkiOperationError(`Deck "${deckName}" not found`, "deleteDecks", {
        hint: "Run nnf anki decks list to see the existing deck names",
        details: { deckName },
      });
    }
    // AnkiConnect 的 deleteDecks 会连同子牌组一起删除, 因此先把整棵子树纳入影响面报告。
    const deletedDecks = names.filter(
      (name: string): boolean => name === deckName || name.startsWith(`${deckName}::`),
    );
    const deletedChildDecks = deletedDecks.filter((name: string): boolean => name !== deckName);
    const cards = parseResponse(
      "findCards",
      numberArrayResponse,
      await port.invoke<unknown>("findCards", { query: deckScopeQuery(deckName) }),
    );
    parseResponse(
      "deleteDecks",
      nullResponse,
      await port.invoke<unknown>("deleteDecks", { decks: [deckName], cardsToo: true }),
    );
    // 上游对不存在的牌组同样返回 null, 只有复核才能区分「已删除」与「什么都没发生」。
    const remaining = parseResponse(
      "deckNames",
      stringArrayResponse,
      await port.invoke<unknown>("deckNames"),
    );
    if (remaining === null) {
      throw new AnkiOperationError(
        `Deck deletion could not be verified: Anki returned no deck list`,
        "deleteDecks",
        {
          hint: "Run nnf anki decks list to confirm the deck is gone",
          details: { deckName },
        },
      );
    }
    const survivors = deletedDecks.filter((name: string): boolean => remaining.includes(name));
    if (survivors.length > 0) {
      throw new AnkiOperationError(
        `Deck deletion did not remove: ${survivors.join(", ")}`,
        "deleteDecks",
        {
          hint: "Run nnf anki decks list to inspect the remaining decks",
          details: { remainingDecks: survivors },
        },
      );
    }
    const cardsDeleted = cards?.length ?? 0;
    const subdeckCount = deletedChildDecks.length;
    return {
      success: true,
      deckName,
      deletedDecks,
      deletedChildDecks,
      cardsDeleted,
      message:
        subdeckCount === 0
          ? `Successfully deleted deck "${deckName}" and ${cardsDeleted} card(s)`
          : `Successfully deleted deck "${deckName}", ${subdeckCount} subdeck(s) and ${cardsDeleted} card(s)`,
      warning: "The deck, its subdecks and their cards have been permanently deleted",
      hint: "Run nnf anki sync to propagate the deletion to other devices",
    };
  } catch (error) {
    return withHint(error, "deleteDecks", "Make sure Anki is running and the deck name is valid");
  }
};
