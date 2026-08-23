import type { JsonValue } from "../../cli/types";
import { AnkiOperationError } from "./errors";
import type { Logger } from "./logger";
import type { AnkiPort } from "./port";

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
  throw new AnkiOperationError(error instanceof Error ? error.message : String(error), action, {
    hint,
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
  if (parts.length > 2) throw new Error("Deck name can have maximum 2 levels (parent::child)");
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
    let parentExisted: boolean | undefined;
    if (parts.length === 2) {
      try {
        const existing = stringArray(await port.invoke<unknown>("deckNames"), "deckNames");
        parentExisted = existing.includes(parts[0] ?? "");
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
      if (parts.length === 2) {
        result["parentDeck"] = parts[0] ?? "";
        result["childDeck"] = parts[1] ?? "";
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
    if (parts.length === 2) {
      result["parentDeck"] = parts[0] ?? "";
      result["childDeck"] = parts[1] ?? "";
      if (parentExisted !== undefined) {
        result["parentExisted"] = parentExisted;
        result["message"] = parentExisted
          ? `Found existing parent deck "${parts[0]}"; created child deck "${parts[1]}"`
          : `Created parent deck "${parts[0]}" and child deck "${parts[1]}"`;
      } else {
        result["message"] = `Created child deck "${parts[1]}" under parent "${parts[0]}"`;
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
