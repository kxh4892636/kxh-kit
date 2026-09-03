import type { MarkdownTransformContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { summarizeSkillBlocksForMarkdown } from "./display.ts";

const userContext: MarkdownTransformContext = {
  availableWidth: 80,
  isStreaming: false,
  messageType: "user",
};

describe("skill block display summary", (): void => {
  it("shows every inline skill block in user-message markdown without exposing its body", (): void => {
    const markdown = `请 <skill name="to-story" location="/skills/to-story/SKILL.md">\nReferences are relative to /skills/to-story.\n\nStory body.\n</skill> 梳理，然后 <skill name="quest-with-domain" location="/skills/quest/SKILL.md">\nReferences are relative to /skills/quest.\n\nDomain body.\n</skill> 拷问`;

    expect(summarizeSkillBlocksForMarkdown(markdown, userContext)).toBe(
      "请 **[skill]** to-story 梳理，然后 **[skill]** quest-with-domain 拷问",
    );
  });

  it("does not alter assistant markdown", (): void => {
    const markdown = `<skill name="to-story" location="/skills/to-story/SKILL.md">\nReferences are relative to /skills/to-story.\n\nStory body.\n</skill>`;

    expect(
      summarizeSkillBlocksForMarkdown(markdown, { ...userContext, messageType: "assistant" }),
    ).toBe(markdown);
  });
});
