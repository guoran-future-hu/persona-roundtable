import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionConfig } from "../config";
import type { ChatMessage, ChatModel } from "../models/types";
import { createDummyModels } from "../models/dummy";
import {
  buildRoundOneMessages,
  buildRoundTwoMessages,
  runRoundtableSession,
  type RoundOutput,
} from "../orchestrator";
import type { LoadedMind } from "../personas";
import { renderDevLog, renderTranscript } from "../transcript";

class FakeModel implements ChatModel {
  readonly provider = "fake";
  readonly model = "fake";
  readonly calls: ChatMessage[][] = [];

  constructor(private readonly label: string) {}

  async generate(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);
    return `${this.label} output ${this.calls.length}`;
  }
}

const config: SessionConfig = {
  topic: "Should I start a company?",
  context: "I have savings. I want autonomy.",
  testMode: false,
  moderatorProvider: "fake",
  providers: {
    fake: { type: "openai", model: "fake", apiKeyEnv: "FAKE_KEY" },
  },
  minds: [],
};

function makeMind(id: string, name: string, model: ChatModel): LoadedMind {
  return {
    id,
    name,
    personaPath: `${id}.md`,
    provider: "fake",
    persona: `${name} persona`,
    model,
  };
}

test("round one prompt includes other minds but no previous opinions", () => {
  const model = new FakeModel("Naval");
  const minds = [makeMind("naval", "Naval", model), makeMind("pg", "Paul Graham", new FakeModel("PG"))];
  const messages = buildRoundOneMessages(config.topic, String(config.context), "Use English.", minds[0]!, minds);

  assert.match(messages[0]!.content, /Paul Graham/);
  assert.match(messages[0]!.content, /Active participants in this session: Naval, Paul Graham/);
  assert.match(messages[0]!.content, /names inside persona material as background context/);
  assert.match(messages[0]!.content, /Round 1: give your independent opening view/);
  assert.match(messages[0]!.content, /Do not amplify disagreement for contrast/);
  assert.doesNotMatch(messages[0]!.content, /Hold the strongest distinct view/);
  assert.match(messages[0]!.content, /Working language:\nUse English\./);
  assert.doesNotMatch(messages[1]!.content, /previously said/);
});

test("round two prompt includes round one opinions and original topic context", () => {
  const mind = makeMind("naval", "Naval", new FakeModel("Naval"));
  const roundOne: RoundOutput[] = [
    { mindId: "naval", mindName: "Naval", content: "initial naval" },
    { mindId: "pg", mindName: "Paul Graham", content: "initial pg" },
  ];
  const messages = buildRoundTwoMessages(config.topic, String(config.context), "Use English.", mind, roundOne);

  assert.match(messages[0]!.content, /Active participants in this session: Naval, Paul Graham/);
  assert.match(messages[0]!.content, /Round 1 opinions define who is actually present/);
  assert.match(messages[0]!.content, /actual tone, confidence, restraint, and temperament/);
  assert.doesNotMatch(messages[0]!.content, /Persuade/);
  assert.match(messages[1]!.content, /<opinion speaker="Naval">/);
  assert.match(messages[1]!.content, /Naval previously said:\ninitial naval/);
  assert.match(messages[1]!.content, /<opinion speaker="Paul Graham">/);
  assert.match(messages[1]!.content, /Paul Graham previously said:\ninitial pg/);
  assert.match(messages[1]!.content, /Should I start a company/);
  assert.match(messages[1]!.content, /I have savings/);
  assert.ok(messages[1]!.content.indexOf("Question:") < messages[1]!.content.indexOf("Round 1 opinions:"));
  assert.ok(messages[1]!.content.indexOf("Context:") < messages[1]!.content.indexOf("Round 1 opinions:"));
});

test("orchestrator preserves fixed order and writes all sections to transcript", async () => {
  const navalModel = new FakeModel("Naval");
  const pgModel = new FakeModel("PG");
  const moderatorModel = new FakeModel("Moderator");
  const minds = [makeMind("naval", "Naval", navalModel), makeMind("pg", "Paul Graham", pgModel)];
  const progress: string[] = [];

  const result = await runRoundtableSession(config, minds, {
    moderatorModel,
    onProgress: (message) => progress.push(message),
  });

  assert.deepEqual(progress, ["Round 1: Naval", "Round 1: Paul Graham", "Round 2: Naval", "Round 2: Paul Graham", "Moderator summary"]);
  assert.equal(result.roundOne[0]?.mindName, "Naval");
  assert.equal(result.roundOne[1]?.mindName, "Paul Graham");
  assert.equal(result.roundTwo[0]?.mindName, "Naval");
  assert.equal(result.roundTwo[1]?.mindName, "Paul Graham");

  const transcript = renderTranscript(
    {
      ...config,
      minds: [
        { id: "naval", name: "Naval", personaPath: "naval.md", provider: "fake" },
        { id: "pg", name: "Paul Graham", personaPath: "pg.md", provider: "fake" },
      ],
    },
    result,
  );

  assert.match(transcript, /## Topic/);
  assert.match(transcript, /## Context/);
  assert.match(transcript, /## Round 1: Initial Views/);
  assert.match(transcript, /## Round 2: Responses and Updates/);
  assert.match(transcript, /## Moderator Summary/);

  const devLog = renderDevLog(
    {
      ...config,
      workingLanguage: "Use English.",
      minds: [
        { id: "naval", name: "Naval", personaPath: "naval.md", provider: "fake" },
        { id: "pg", name: "Paul Graham", personaPath: "pg.md", provider: "fake" },
      ],
    },
    result,
  );

  assert.match(devLog, /## Model Calls/);
  assert.match(devLog, /### round-one: Naval/);
  assert.match(devLog, /#### Prompt Messages/);
  assert.match(devLog, /##### Message 1: system/);
  assert.match(devLog, /Working language:/);
  assert.match(devLog, /#### Response/);
});

test("orchestrator records prompts while dummy models return deterministic outputs", async () => {
  const dummyConfig: SessionConfig = {
    topic: "Should I start a company?",
    context: "I have savings. I want autonomy.",
    testMode: true,
    moderatorProvider: "deepseek",
    providers: {
      deepseek: {
        type: "deepseek",
        model: "deepseek-v4-flash",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        reasoningEffort: "high",
      },
    },
    minds: [
      { id: "andrej-karpathy", name: "Andrej Karpathy", personaPath: "karpathy.md", provider: "deepseek" },
      { id: "trump", name: "Donald Trump", personaPath: "trump.md", provider: "deepseek" },
    ],
  };
  const models = createDummyModels({ ...dummyConfig, configPath: "config.json", configDir: "." });
  const minds = [
    makeMind("andrej-karpathy", "Andrej Karpathy", models.deepseek!),
    makeMind("trump", "Donald Trump", models.deepseek!),
  ];

  const result = await runRoundtableSession(dummyConfig, minds, {
    moderatorModel: models.deepseek!,
  });

  assert.equal(result.roundOne[0]?.content, "[andrej-karpathy, round 1]");
  assert.equal(result.roundOne[1]?.content, "[trump, round 1]");
  assert.equal(result.roundTwo[0]?.content, "[andrej-karpathy, round 2]");
  assert.equal(result.roundTwo[1]?.content, "[trump, round 2]");
  assert.equal(result.moderatorSummary, "[moderator, summary]");
  assert.equal(result.modelCalls.length, 5);
  assert.match(result.modelCalls[0]!.messages[0]!.content, /Andrej Karpathy persona/);
  assert.match(result.modelCalls[0]!.messages[1]!.content, /Should I start a company/);
});
