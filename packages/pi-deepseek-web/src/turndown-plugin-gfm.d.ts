/**
 * Ambient declaration for `@joplin/turndown-plugin-gfm`, which ships no types
 * and has no DefinitelyTyped package. Only the composite `gfm` plugin is
 * declared; the package's individual plugins stay undeclared until imported.
 */
declare module "@joplin/turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  /** The composite GitHub-flavored-markdown plugin (tables, strikethrough, task lists, fenced code). */
  export const gfm: TurndownService.Plugin;
}
