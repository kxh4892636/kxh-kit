import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonError } from "../../../cli/json-error";
import { runCli } from "../../../cli/run";
import { makeClient } from "../../../test-helpers/make-client";
import {
  startFakeAnkiConnect,
  type FakeAnkiConnect,
  type FakeResponder,
} from "../../../test-fixtures/fake-anki-connect";
import { runAddModelField } from "../field-add-command";
import { runCreateModel } from "../create-command";
import { runModelNames } from "../list-command";
import { runModelFieldNames } from "../fields-command";
import { runModelTemplates } from "../templates-command";
import { runRenameModelField } from "../field-rename-command";
import { runUpdateModelTemplates } from "../update-templates-command";

const servers: FakeAnkiConnect[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  vi.restoreAllMocks();
  process.exitCode = 0;
});

const start = async (responder: FakeResponder): Promise<string> => {
  const server = await startFakeAnkiConnect(responder);
  servers.push(server);
  return server.url;
};

describe("runModelNames", () => {
  it("返回模型名与常见类型探测", async () => {
    const url = await start((req) => {
      if (req.action === "modelNames")
        return { result: ["Basic", "Basic (and reversed card)", "Custom"] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runModelNames(makeClient(url));

    expect(result).toMatchObject({
      success: true,
      total: 3,
      commonTypes: {
        basic: "Basic",
        basicReversed: "Basic (and reversed card)",
        cloze: null,
      },
    });
  });
});

describe("runModelFieldNames", () => {
  it("Basic 类型附示例字段", async () => {
    const url = await start((req) => {
      if (req.action === "modelFieldNames") return { result: ["Front", "Back"] };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runModelFieldNames(makeClient(url), { modelName: "Basic" });

    expect(result).toMatchObject({ success: true, total: 2 });
    expect(result.example).toEqual({
      Front: "Question or prompt text",
      Back: "Answer or response text",
    });
  });

  it("模型不存在报错", async () => {
    const url = await start((req) => {
      if (req.action === "modelFieldNames") return { result: null };
      throw new Error(`unexpected action ${req.action}`);
    });

    await expect(
      runModelFieldNames(makeClient(url), { modelName: "Missing" }),
    ).rejects.toMatchObject({ name: "JsonError", action: "modelFieldNames" });
  });
});

describe("runModelTemplates", () => {
  it("返回模板对象", async () => {
    const url = await start((req) => {
      if (req.action === "modelTemplates")
        return { result: { "Card 1": { Front: "{{Front}}", Back: "{{Back}}" } } };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runModelTemplates(makeClient(url), { modelName: "Basic" });

    expect(result).toMatchObject({ success: true });
    expect(result.templates["Card 1"]?.Front).toBe("{{Front}}");
  });
});

describe("runCreateModel", () => {
  it("创建成功(含模板未声明字段的警告)", async () => {
    const url = await start((req) => {
      if (req.action === "createModel") return { result: { id: 9 } };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runCreateModel(makeClient(url), {
      modelName: "Custom",
      inOrderFields: ["Front", "Back"],
      cardTemplates: [{ Name: "Card 1", Front: "{{Front}} {{Extra}}", Back: "{{Back}}" }],
    });

    expect(result).toMatchObject({ success: true, modelId: 9, templateCount: 1 });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain("Extra");
  });

  it("重名模型报错并提示", async () => {
    const url = await start((req) => {
      if (req.action === "createModel") return { error: "Model name already exists" };
      throw new Error(`unexpected action ${req.action}`);
    });

    try {
      await runCreateModel(makeClient(url), {
        modelName: "Basic",
        inOrderFields: ["Front"],
        cardTemplates: [{ Name: "Card 1", Front: "x", Back: "y" }],
      });
      expect.unreachable("应当抛错");
    } catch (error) {
      expect((error as JsonError).hint).toContain("already exists");
    }
  });
});

describe("runAddModelField", () => {
  const fieldsResponder: FakeResponder = (req) => {
    if (req.action === "modelFieldNames") return { result: ["Front", "Back"] };
    if (req.action === "modelFieldAdd") return { result: null };
    throw new Error(`unexpected action ${req.action}`);
  };

  it("添加成功(缺省 index=null)", async () => {
    const url = await start(fieldsResponder);

    const result = await runAddModelField(makeClient(url), {
      modelName: "Basic",
      fieldName: "Extra",
    });

    expect(result).toMatchObject({ success: true, index: null });
  });

  it("重名字段拒绝", async () => {
    const url = await start(fieldsResponder);

    await expect(
      runAddModelField(makeClient(url), {
        modelName: "Basic",
        fieldName: "Front",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("大小写变体冲突拒绝", async () => {
    const url = await start(fieldsResponder);

    await expect(
      runAddModelField(makeClient(url), {
        modelName: "Basic",
        fieldName: "front",
      }),
    ).rejects.toThrow(/differ only in case/);
  });

  it("越界 index 拒绝", async () => {
    const url = await start(fieldsResponder);

    await expect(
      runAddModelField(makeClient(url), {
        modelName: "Basic",
        fieldName: "Extra",
        index: 99,
      }),
    ).rejects.toThrow(/out of range/);
  });
});

describe("runRenameModelField", () => {
  const fieldsResponder: FakeResponder = (req) => {
    if (req.action === "modelFieldNames") return { result: ["Front", "Back"] };
    if (req.action === "modelFieldRename") return { result: null };
    throw new Error(`unexpected action ${req.action}`);
  };

  it("改名成功并附模板手动更新警告", async () => {
    const url = await start(fieldsResponder);

    const result = await runRenameModelField(makeClient(url), {
      modelName: "Basic",
      oldFieldName: "Back",
      newFieldName: "Answer",
    });

    expect(result).toMatchObject({ success: true, newFieldName: "Answer" });
    expect(result.warning).toContain("{{Back}}");
  });

  it("新旧同名拒绝", async () => {
    const url = await start(fieldsResponder);

    await expect(
      runRenameModelField(makeClient(url), {
        modelName: "Basic",
        oldFieldName: "Back",
        newFieldName: "Back",
      }),
    ).rejects.toThrow(/identical/);
  });

  it("新名已存在拒绝", async () => {
    const url = await start(fieldsResponder);

    await expect(
      runRenameModelField(makeClient(url), {
        modelName: "Basic",
        oldFieldName: "Back",
        newFieldName: "Front",
      }),
    ).rejects.toThrow(/already exists/);
  });
});

describe("runUpdateModelTemplates", () => {
  it("模板名不匹配拒绝(大小写敏感)", async () => {
    const url = await start((req) => {
      if (req.action === "modelTemplates")
        return { result: { "Card 1": { Front: "a", Back: "b" } } };
      throw new Error(`unexpected action ${req.action}`);
    });

    try {
      await runUpdateModelTemplates(makeClient(url), {
        modelName: "Basic",
        templates: { "card 1": { Front: "x", Back: "y" } },
      });
      expect.unreachable("应当抛错");
    } catch (error) {
      expect((error as JsonError).action).toBe("updateModelTemplates");
      expect((error as JsonError).message).toContain("not found in model");
      expect((error as JsonError).hint).toContain("case-sensitive");
    }
  });

  it("匹配时更新成功", async () => {
    const url = await start((req) => {
      if (req.action === "modelTemplates")
        return { result: { "Card 1": { Front: "a", Back: "b" } } };
      if (req.action === "updateModelTemplates") return { result: null };
      throw new Error(`unexpected action ${req.action}`);
    });

    const result = await runUpdateModelTemplates(makeClient(url), {
      modelName: "Basic",
      templates: { "Card 1": { Front: "x", Back: "y" } },
    });

    expect(result).toMatchObject({ success: true, templateCount: 1 });
  });
});

describe("CLI 端到端(models 组)", () => {
  it("models list 输出 success JSON", async () => {
    const url = await start((req) => {
      if (req.action === "modelNames") return { result: ["Basic"] };
      throw new Error(`unexpected action ${req.action}`);
    });
    const stdout: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await runCli(["models", "list", "--anki-connect", url]);

    expect(process.exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      success: true,
      total: 1,
    });
  });

  it("models field-remove 未 --yes: 退出码 1 + 错误 JSON", async () => {
    const url = await start(() => ({ result: null }));
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    await runCli(["models", "field-remove", "Basic", "Front", "--anki-connect", url]);

    expect(process.exitCode).toBe(1);
    const blocks = stderr.filter((b) => b.trim().startsWith("{"));
    expect(JSON.parse(blocks.at(-1) ?? "{}")).toMatchObject({
      success: false,
      action: "removeModelField",
    });
  });
});
