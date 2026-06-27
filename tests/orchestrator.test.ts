import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionConfig } from "../config";
import type { ChatMessage, ChatModel } from "../models/types";
import { createDummyModels } from "../models/dummy";
import {
  buildRoundOneMessages,
  buildRoundTwoMessages,
  runRoundtableSession,
  SessionRunError,
  type CompressedOutput,
  type RoundOutput,
  type SpeakerOutput,
} from "../orchestrator";
import type { LoadedMind } from "../personas";
import { renderDevLog, renderTranscript } from "../transcript";

class FakeModel implements ChatModel {
  readonly provider = "fake";
  readonly model = "fake";
  readonly calls: ChatMessage[][] = [];
  readonly options: Array<Parameters<ChatModel["generate"]>[1]> = [];

  constructor(private readonly label: string) {}

  async generate(messages: ChatMessage[], options?: Parameters<ChatModel["generate"]>[1]): Promise<string> {
    this.calls.push(messages);
    this.options.push(options);
    return `${this.label} output ${this.calls.length}`;
  }
}

class FailingModel implements ChatModel {
  readonly provider = "fake";
  readonly model = "fake";

  async generate(): Promise<string> {
    throw new Error("planned model failure");
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
  assert.equal(navalModel.options[0]?.maxOutputTokens, 8192);
  assert.equal(navalModel.options[1]?.maxOutputTokens, 8192);
  assert.equal(moderatorModel.options[0]?.maxOutputTokens, 8192);

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

test("orchestrator compresses every speaker output for live monitoring", async () => {
  const navalModel = new FakeModel("Naval");
  const pgModel = new FakeModel("PG");
  const moderatorModel = new FakeModel("Moderator");
  const compressionModel = new FakeModel("Compression");
  const minds = [makeMind("naval", "Naval", navalModel), makeMind("pg", "Paul Graham", pgModel)];
  const compressedOutputs: CompressedOutput[] = [];

  const result = await runRoundtableSession(config, minds, {
    moderatorModel,
    compressionModel,
    onCompressedOutput: (output) => compressedOutputs.push(output),
  });

  assert.equal(compressionModel.calls.length, 5);
  assert.deepEqual(result.modelCalls.map((call) => call.phase), [
    "round-one",
    "compression",
    "round-one",
    "compression",
    "round-two",
    "compression",
    "round-two",
    "compression",
    "moderator-summary",
    "compression",
  ]);
  assert.deepEqual(
    compressedOutputs.map((output) => `${output.phaseLabel}: ${output.speaker} -> ${output.content}`),
    [
      "Round 1: Naval -> Compression output 1",
      "Round 1: Paul Graham -> Compression output 2",
      "Round 2: Naval -> Compression output 3",
      "Round 2: Paul Graham -> Compression output 4",
      "Moderator Summary: Moderator -> Compression output 5",
    ],
  );
  assert.match(compressionModel.calls[0]![1]!.content, /Speaker:\nNaval/);
  assert.doesNotMatch(compressionModel.calls[0]![1]!.content, /Phase:/);
  assert.match(compressionModel.calls[0]![1]!.content, /Naval output 1/);

  const configWithMinds: SessionConfig = {
    ...config,
    compressionProvider: "fake",
    minds: [
      { id: "naval", name: "Naval", personaPath: "naval.md", provider: "fake" },
      { id: "pg", name: "Paul Graham", personaPath: "pg.md", provider: "fake" },
    ],
  };
  const transcript = renderTranscript(configWithMinds, result);
  const devLog = renderDevLog(configWithMinds, result);

  assert.doesNotMatch(transcript, /Compression output/);
  assert.match(devLog, /### compression: Naval/);
  assert.match(devLog, /Compression output 1/);
  assert.match(devLog, /"compressionProvider": "fake"/);
});

test("orchestrator emits raw speaker outputs when compression is disabled", async () => {
  const navalModel = new FakeModel("Naval");
  const pgModel = new FakeModel("PG");
  const moderatorModel = new FakeModel("Moderator");
  const minds = [makeMind("naval", "Naval", navalModel), makeMind("pg", "Paul Graham", pgModel)];
  const speakerOutputs: SpeakerOutput[] = [];
  const compressedOutputs: CompressedOutput[] = [];

  const result = await runRoundtableSession(config, minds, {
    moderatorModel,
    onSpeakerOutput: (output) => speakerOutputs.push(output),
    onCompressedOutput: (output) => compressedOutputs.push(output),
  });

  assert.equal(result.modelCalls.length, 5);
  assert.deepEqual(
    speakerOutputs.map((output) => `${output.phaseLabel}: ${output.speaker} -> ${output.content}`),
    [
      "Round 1: Naval -> Naval output 1",
      "Round 1: Paul Graham -> PG output 1",
      "Round 2: Naval -> Naval output 2",
      "Round 2: Paul Graham -> PG output 2",
      "Moderator Summary: Moderator -> Moderator output 1",
    ],
  );
  assert.deepEqual(compressedOutputs, []);
});

test("orchestrator exposes partial result when a primary model call fails", async () => {
  const minds = [makeMind("naval", "Naval", new FakeModel("Naval")), makeMind("pg", "Paul Graham", new FailingModel())];

  await assert.rejects(
    async () => runRoundtableSession(config, minds, { moderatorModel: new FakeModel("Moderator") }),
    (error: unknown) => {
      assert.ok(error instanceof SessionRunError);
      assert.equal(error.message, "planned model failure");
      assert.equal(error.partialResult.roundOne.length, 1);
      assert.equal(error.partialResult.roundOne[0]?.content, "Naval output 1");
      assert.equal(error.partialResult.modelCalls.length, 2);
      assert.equal(error.partialResult.modelCalls[1]?.phase, "round-one");
      assert.equal(error.partialResult.modelCalls[1]?.response, "[ERROR] planned model failure");
      assert.equal(error.partialResult.error, "planned model failure");

      const devLog = renderDevLog(
        {
          ...config,
          minds: [
            { id: "naval", name: "Naval", personaPath: "naval.md", provider: "fake" },
            { id: "pg", name: "Paul Graham", personaPath: "pg.md", provider: "fake" },
          ],
        },
        error.partialResult,
      );
      assert.match(devLog, /## Run Error/);
      assert.match(devLog, /planned model failure/);
      return true;
    },
  );
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
  assert.deepEqual(result.modelCalls.map((call) => call.phase), [
    "round-one",
    "round-one",
    "round-two",
    "round-two",
    "moderator-summary",
  ]);
  assert.match(result.modelCalls[0]!.messages[0]!.content, /Andrej Karpathy persona/);
  assert.match(result.modelCalls[0]!.messages[1]!.content, /Should I start a company/);
});
