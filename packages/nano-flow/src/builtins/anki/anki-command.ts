import { group, option } from "../../cli/definition";
import type { BuiltinCommand } from "../../cli/types";
import { createCardsGroup } from "./cards";
import { createDecksGroup } from "./decks";
import { createGuiGroup } from "./gui";
import { createMediaGroup } from "./media";
import { createModelsGroup } from "./models";
import { createNotesGroup } from "./notes";
import { createReviewCommand } from "./review";
import { createStatsGroup } from "./stats";
import { createSyncCommand } from "./sync";
import { createTagsGroup } from "./tags";
import type { AnkiDependencies } from "./runtime";

export type { AnkiDependencies } from "./runtime";

const ankiOptions = [
  option.string("anki-connect", "AnkiConnect URL", {}),
  option.boolean("read-only", "Block collection writes", {}),
] as const;

export const createAnkiCommand = (dependencies: AnkiDependencies): BuiltinCommand =>
  group(
    "anki",
    "Manage Anki through AnkiConnect",
    [
      createDecksGroup(dependencies),
      createNotesGroup(dependencies),
      createModelsGroup(dependencies),
      createCardsGroup(dependencies),
      createSyncCommand(dependencies),
      createReviewCommand(dependencies),
      createTagsGroup(dependencies),
      createMediaGroup(dependencies),
      createStatsGroup(dependencies),
      createGuiGroup(dependencies),
    ],
    ankiOptions,
  );
