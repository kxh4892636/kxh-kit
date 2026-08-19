import { z } from "zod";
import { JsonError } from "../../cli/json-error";
import type { AnkiConnectClient } from "../../client/anki-connect-client";

export const createDeckParamsSchema = z.object({
  deckName: z.string().min(1),
});

export type CreateDeckParams = z.infer<typeof createDeckParamsSchema>;

export interface CreateDeckResult {
  success: boolean;
  deckId?: number;
  deckName: string;
  message: string;
  created: boolean;
  exists?: boolean;
  parentDeck?: string;
  childDeck?: string;
  parentExisted?: boolean;
}

/**
 * 创建空牌组(上游 createDeck): 支持 父::子(最多 2 层), 不覆盖已有牌组。
 * 父牌组是否已存在通过 deckNames 预检诚实报告(AnkiConnect 会静默「创建」已有父牌组)。
 */
export const runCreateDeck = async (
  client: AnkiConnectClient,
  params: CreateDeckParams,
): Promise<CreateDeckResult> => {
  try {
    const { deckName } = params;

    const parts = deckName.split("::");
    if (parts.length > 2) {
      throw new Error("Deck name can have maximum 2 levels (parent::child)");
    }
    if (parts.some((part) => part.trim() === "")) {
      throw new Error("Deck name parts cannot be empty");
    }

    let parentExisted: boolean | undefined;
    if (parts.length === 2) {
      try {
        const existingDecks = await client.invoke<string[]>("deckNames");
        parentExisted = existingDecks.includes(parts[0]!);
      } catch {
        parentExisted = undefined;
      }
    }

    const deckId = await client.invoke<number>("createDeck", { deck: deckName });

    if (!deckId) {
      const existingDecks = await client.invoke<string[]>("deckNames");
      const deckExists = existingDecks.includes(deckName);

      if (deckExists) {
        const result: CreateDeckResult = {
          success: true,
          message: `Deck "${deckName}" already exists`,
          deckName,
          created: false,
          exists: true,
        };
        if (parts.length === 2) {
          result.parentDeck = parts[0]!;
          result.childDeck = parts[1]!;
          if (parentExisted !== undefined) {
            result.parentExisted = parentExisted;
          }
        }
        return result;
      }

      throw new Error("Failed to create deck - unknown error");
    }

    const result: CreateDeckResult = {
      success: true,
      deckId,
      deckName,
      message: `Successfully created deck "${deckName}"`,
      created: true,
    };

    if (parts.length === 2) {
      result.parentDeck = parts[0]!;
      result.childDeck = parts[1]!;
      if (parentExisted !== undefined) {
        result.parentExisted = parentExisted;
        result.message = parentExisted
          ? `Found existing parent deck "${parts[0]}"; created child deck "${parts[1]}"`
          : `Created parent deck "${parts[0]}" and child deck "${parts[1]}"`;
      } else {
        result.message = `Created child deck "${parts[1]}" under parent "${parts[0]}"`;
      }
    }

    return result;
  } catch (error) {
    if (error instanceof JsonError) {
      throw error;
    }
    throw new JsonError(error instanceof Error ? error.message : String(error), {
      action: "createDeck",
      hint: "Make sure Anki is running and the deck name is valid",
    });
  }
};
