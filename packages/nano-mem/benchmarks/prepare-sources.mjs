import { createReadStream } from "node:fs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { evalRoot, runRoot, readJson, writeJson } from "./model-call.mjs";

const sourceRoot = resolve(runRoot, "sources");
const saveChunks = async (group, key, header, body) => {
  const sources = [];
  // 所有文字按固定长度分块，不根据测试问题选择或删减历史。
  for (let offset = 0; offset < body.length; offset += 180000) {
    const id = `${group}-${key}-${offset / 180000}`;
    const path = resolve(sourceRoot, `${id}.txt`);
    await writeFile(
      path,
      `${header}\nPart ${offset / 180000 + 1}\n${body.slice(offset, offset + 180000)}`,
    );
    sources.push({ id, group, path, source: `${key}:part-${offset / 180000 + 1}` });
  }
  return sources;
};

export const prepareLocomo = async () => {
  await mkdir(sourceRoot, { recursive: true });
  const dataset = await readJson(resolve(evalRoot, "locomo/data/locomo10.json"));
  const sources = [];
  const questions = [];
  for (const [index, item] of dataset.entries()) {
    const group = `locomo-${index}`;
    const sessions = Object.keys(item.conversation).filter((name) => /^session_\d+$/u.test(name));
    for (const session of sessions) {
      const date = item.conversation[`${session}_date_time`];
      const turns = item.conversation[session]
        .map(
          (turn) =>
            `${turn.dia_id} ${turn.speaker}: ${turn.text}${turn.blip_caption ? ` [image caption: ${turn.blip_caption}]` : ""}`,
        )
        .join("\n");
      sources.push(
        ...(await saveChunks(
          group,
          session,
          `Conversation ${index}. Session date: ${date}. Speakers: ${item.conversation.speaker_a}, ${item.conversation.speaker_b}.`,
          turns,
        )),
      );
    }
    item.qa.forEach((qa, questionIndex) =>
      questions.push({ ...qa, id: `${group}-q${questionIndex}`, group, benchmark: "locomo" }),
    );
  }
  await writeJson(resolve(runRoot, "locomo-sources.json"), sources);
  await writeJson(resolve(runRoot, "locomo-questions.json"), questions);
  return { benchmark: "locomo", sources: sources.length, questions: questions.length };
};

export const prepareLme = async () => {
  await mkdir(sourceRoot, { recursive: true });
  const dataRoot = resolve(evalRoot, "data/lme-v2");
  const haystacks = await readJson(resolve(dataRoot, "haystacks/lme_v2_small.json"));
  const questions = (await readFile(resolve(dataRoot, "questions.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  const wanted = new Set(Object.values(haystacks).flat());
  const domains = new Map();
  for (const question of questions) {
    const ids = JSON.stringify(haystacks[question.id]);
    if (domains.has(question.domain) && domains.get(question.domain) !== ids)
      throw new Error("Small haystacks are not shared by domain");
    domains.set(question.domain, ids);
  }
  const sourcesById = new Map();
  const lines = createInterface({
    input: createReadStream(resolve(dataRoot, "trajectories.jsonl")),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    const trajectory = JSON.parse(line);
    if (!wanted.has(trajectory.id)) continue;
    const header = `Domain: ${trajectory.domain}. Goal: ${trajectory.goal}. Outcome: ${trajectory.outcome}. Start URL: ${trajectory.start_url}.`;
    const body = trajectory.states
      .map(
        (state) =>
          `State ${state.state_index}, URL ${state.url}\nAction: ${JSON.stringify(state.action)}\nThought: ${state.thought ?? ""}\nObservation:\n${state.accessibility_tree ?? ""}`,
      )
      .join("\n\n");
    sourcesById.set(
      trajectory.id,
      await saveChunks(`lme-${trajectory.domain}`, trajectory.id, header, body),
    );
  }
  if (sourcesById.size !== wanted.size)
    throw new Error(`Missing trajectories: ${sourcesById.size}/${wanted.size}`);
  const sources = [...domains.values()].flatMap((ids) =>
    JSON.parse(ids).flatMap((id) => sourcesById.get(id)),
  );
  await writeJson(resolve(runRoot, "lme-sources.json"), sources);
  await writeJson(
    resolve(runRoot, "lme-questions.json"),
    questions.map((question) => ({
      ...question,
      group: `lme-${question.domain}`,
      benchmark: "lme",
      image: question.image ? resolve(dataRoot, question.image) : null,
    })),
  );
  return {
    benchmark: "lme",
    trajectories: wanted.size,
    sources: sources.length,
    questions: questions.length,
  };
};

if (process.argv[2]) {
  try {
    console.log(
      JSON.stringify(await (process.argv[2] === "locomo" ? prepareLocomo() : prepareLme())),
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
