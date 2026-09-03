import type { MarkdownTransformContext } from "@earendil-works/pi-coding-agent";

const SKILL_BLOCK_PATTERN = /<skill name="([^"]+)" location="[^"]+">\n[\s\S]*?\n<\/skill>/g;

export const summarizeSkillBlocksForMarkdown = (
  markdown: string,
  context: MarkdownTransformContext,
): string => {
  if (context.messageType !== "user") return markdown;
  return markdown.replace(
    SKILL_BLOCK_PATTERN,
    (_block: string, name: string): string => `**[skill]** ${name}`,
  );
};
