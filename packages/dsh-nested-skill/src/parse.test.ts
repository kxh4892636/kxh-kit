import { describe, expect, it } from "vitest";
import { parseSkillText } from "./parse.js";

const VALID = `---
name: to-story
description: 讲述用户故事
whenToUse: 角色未明确时
---

# To Story

步骤正文。
`;

describe("parseSkillText", () => {
  it("parses a valid skill body and trims content", () => {
    const parsed = parseSkillText(VALID);
    expect(parsed).toEqual({
      name: "to-story",
      description: "讲述用户故事",
      whenToUse: "角色未明确时",
      invocation: { modelInvocable: true, userInvocable: true },
      content: "# To Story\n\n步骤正文。",
    });
  });

  it("returns undefined without leading frontmatter", () => {
    expect(parseSkillText("# No frontmatter")).toBeUndefined();
  });

  it("returns undefined without closing frontmatter", () => {
    expect(parseSkillText("---\nname: x\n")).toBeUndefined();
  });

  it("returns undefined for invalid YAML", () => {
    expect(parseSkillText("---\nname: [unclosed\n---\nbody")).toBeUndefined();
  });

  it("requires name and description", () => {
    expect(parseSkillText("---\ndescription: 只有描述\n---\nbody")).toBeUndefined();
    expect(parseSkillText("---\nname: only-name\n---\nbody")).toBeUndefined();
  });

  it("rejects non-kebab-case names", () => {
    expect(parseSkillText("---\nname: To Story\ndescription: x\n---\nbody")).toBeUndefined();
  });

  it("applies invocation policy fields", () => {
    const parsed = parseSkillText(`---
name: hidden-from-model
description: x
disable-model-invocation: true
user-invocable: false
---
body`);
    expect(parsed?.invocation).toEqual({ modelInvocable: false, userInvocable: false });
  });

  it("accepts legacy boolean spellings", () => {
    const parsed = parseSkillText(`---
name: yes-name
description: x
disable-model-invocation: "yes"
---
body`);
    expect(parsed?.invocation.modelInvocable).toBe(false);
  });

  it("rejects legacy invocation keys", () => {
    expect(
      parseSkillText(`---
name: legacy
description: x
disableModelInvocation: true
---
body`),
    ).toBeUndefined();
  });

  it("rejects non-boolean invocation values", () => {
    expect(
      parseSkillText(`---
name: bad-boolean
description: x
user-invocable: maybe
---
body`),
    ).toBeUndefined();
  });

  it("passes through metadata objects", () => {
    const parsed = parseSkillText(`---
name: meta-skill
description: x
metadata:
  owner: dsh
---
body`);
    expect(parsed?.metadata).toEqual({ owner: "dsh" });
  });

  it("ignores non-object metadata and parses numeric boolean spellings", () => {
    const parsed = parseSkillText(`---
name: booleans
description: x
metadata: plain
disable-model-invocation: 0
user-invocable: "on"
---
body`);
    expect(parsed?.metadata).toBeUndefined();
    expect(parsed?.invocation).toEqual({ modelInvocable: true, userInvocable: true });
    const off = parseSkillText(`---
name: off-name
description: x
user-invocable: off
---
body`);
    expect(off?.invocation.userInvocable).toBe(false);
  });
});
