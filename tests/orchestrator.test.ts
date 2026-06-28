import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionConfig } from "../config";
import type { ChatMessage, ChatModel } from "../models/types";
import { createDummyModels } from "../models/dummy";
import {
  buildFinalSummaryMessages,
  buildFollowUpRoundMessages,
  buildModeratorMessages,
  buildRoundOneMessages,
  parseModeratorReview,
  runRoundtableSession,
  SessionRunError,
  type CompressedOutput,
  type ModeratorReview,
  type RoundResult,
  type SpeakerOutput,
} from "../orchestrator";
import type { LoadedMind } from "../personas";
import { renderDevLog, renderTranscript } from "../transcript";

class FakeModel implements ChatModel {
  readonly provider = "fake";
  readonly model = "fake";
  readonly calls: ChatMessage[][] = [];
  readonly options: Array<Parameters<ChatModel["generate"]>[1]> = [];
  private readonly responses: string[];

  constructor(private readonly label: string, responses: string[] = []) {
    this.responses = [...responses];
  }

  async generate(messages: ChatMessage[], options?: Parameters<ChatModel["generate"]>[1]): Promise<string> {
    this.calls.push(messages);
    this.options.push(options);
    const response = this.responses.shift();

    return response ?? `${this.label} output ${this.calls.length}`;
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
  maxRounds: 3,
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

function review(
  roundNumber: number,
  decision: ModeratorReview["decision"] = "continue",
  endReason = "",
): string {
  return JSON.stringify({
    roundSummary: `summary ${roundNumber}`,
    progressNote: `progress ${roundNumber}`,
    comparisonToPrevious: roundNumber === 1 ? "No previous progress note." : `comparison ${roundNumber}`,
    decision,
    endReason,
  });
}

test("round one prompt includes session data but no previous opinions", () => {
  const model = new FakeModel("Naval");
  const minds = [makeMind("naval", "Naval", model), makeMind("pg", "Paul Graham", new FakeModel("PG"))];
  const messages = buildRoundOneMessages(config.topic, String(config.context), "Use English.", minds[0]!, minds);

  assert.match(messages[0]!.content, /Paul Graham/);
  assert.match(messages[0]!.content, /Naval, Paul Graham/);
  assert.match(messages[0]!.content, /Working language:\nUse English\./);
  assert.match(messages[1]!.content, /Should I start a company/);
  assert.match(messages[1]!.content, /I have savings/);
  assert.doesNotMatch(messages[1]!.content, /previous rounds/i);
});

test("follow-up prompt includes previous rounds, progress notes, and original topic context", () => {
  const mind = makeMind("naval", "Naval", new FakeModel("Naval"));
  const previousRounds: RoundResult[] = [
    {
      roundNumber: 1,
      outputs: [
        { mindId: "naval", mindName: "Naval", content: "initial naval" },
        { mindId: "pg", mindName: "Paul Graham", content: "initial pg" },
      ],
    },
  ];
  const reviews: ModeratorReview[] = [
    {
      roundNumber: 1,
      roundSummary: "opening positions",
      progressNote: "defined the core tradeoff",
      comparisonToPrevious: "No previous progress note.",
      decision: "continue",
      endReason: "",
    },
  ];
  const messages = buildFollowUpRoundMessages(config.topic, String(config.context), "Use English.", 2, mind, previousRounds, reviews);

  assert.match(messages[1]!.content, /<round number="1">/);
  assert.match(messages[1]!.content, /Naval said:\ninitial naval/);
  assert.match(messages[1]!.content, /Paul Graham said:\ninitial pg/);
  assert.match(messages[1]!.content, /defined the core tradeoff/);
  assert.match(messages[1]!.content, /Should I start a company/);
  assert.match(messages[1]!.content, /I have savings/);
  assert.ok(messages[1]!.content.indexOf("Question:") < messages[1]!.content.indexOf("Previous rounds:"));
  assert.ok(messages[1]!.content.indexOf("Context:") < messages[1]!.content.indexOf("Previous rounds:"));
});

test("moderator prompt includes current round and previous progress data", () => {
  const currentRound: RoundResult = {
    roundNumber: 2,
    outputs: [{ mindId: "naval", mindName: "Naval", content: "updated naval" }],
  };
  const messages = buildModeratorMessages(
    config.topic,
    String(config.context),
    "Use English.",
    currentRound,
    [
      {
        roundNumber: 1,
        roundSummary: "opening",
        progressNote: "same few points",
        comparisonToPrevious: "No previous progress note.",
        decision: "continue",
        endReason: "",
      },
    ],
    config.maxRounds,
  );

  assert.doesNotMatch(messages[1]!.content, /Can end discussion/);
  assert.match(messages[1]!.content, /Round number:\n2/);
  assert.match(messages[1]!.content, /Max rounds:\n3/);
  assert.match(messages[1]!.content, /same few points/);
  assert.match(messages[1]!.content, /updated naval/);
});

test("final summary prompt includes full discussion context and stop reason", () => {
  const rounds: RoundResult[] = [
    {
      roundNumber: 1,
      outputs: [{ mindId: "naval", mindName: "Naval", content: "initial naval" }],
    },
  ];
  const reviews: ModeratorReview[] = [
    {
      roundNumber: 1,
      roundSummary: "opening",
      progressNote: "defined the core tradeoff",
      comparisonToPrevious: "No previous progress note.",
      decision: "continue",
      endReason: "",
    },
  ];

  const messages = buildFinalSummaryMessages(config.topic, String(config.context), "Use English.", rounds, reviews, "Reached maxRounds (1).");

  assert.match(messages[0]!.content, /Produce a final synthesis/);
  assert.match(messages[1]!.content, /Should I start a company/);
  assert.match(messages[1]!.content, /Reached maxRounds \(1\)\./);
  assert.match(messages[1]!.content, /defined the core tradeoff/);
  assert.match(messages[1]!.content, /Naval said:\ninitial naval/);
});

test("parseModeratorReview normalizes round one end decision to continue", () => {
  const parsed = parseModeratorReview(review(1, "end_discussion", "Already converged."), 1);

  assert.equal(parsed.decision, "continue");
  assert.equal(parsed.endReason, "");
});

test("orchestrator runs exactly maxRounds when moderator always continues", async () => {
  const navalModel = new FakeModel("Naval");
  const pgModel = new FakeModel("PG");
  const moderatorModel = new FakeModel("Moderator", [review(1), review(2), review(3)]);
  const minds = [makeMind("naval", "Naval", navalModel), makeMind("pg", "Paul Graham", pgModel)];
  const progress: string[] = [];

  const result = await runRoundtableSession(config, minds, {
    moderatorModel,
    onProgress: (message) => progress.push(message),
  });

  assert.deepEqual(progress, [
    "Round 1: Naval",
    "Round 1: Paul Graham",
    "Moderator review: Round 1",
    "Round 2: Naval",
    "Round 2: Paul Graham",
    "Moderator review: Round 2",
    "Round 3: Naval",
    "Round 3: Paul Graham",
    "Moderator review: Round 3",
    "Moderator final summary",
  ]);
  assert.equal(result.rounds.length, 3);
  assert.equal(result.rounds[0]?.outputs[0]?.mindName, "Naval");
  assert.equal(result.rounds[1]?.outputs[1]?.mindName, "Paul Graham");
  assert.equal(result.moderatorReviews.length, 3);
  assert.equal(result.finalSummary, "Moderator output 4");
  assert.equal(result.stopReason, "Reached maxRounds (3).");
  assert.equal(navalModel.options[0]?.maxOutputTokens, 8192);
  assert.equal(navalModel.options[1]?.maxOutputTokens, 8192);
  assert.equal(moderatorModel.options[0]?.maxOutputTokens, 1400);
  assert.equal(moderatorModel.options[3]?.maxOutputTokens, 2200);
  assert.deepEqual(result.modelCalls.map((call) => call.phase), [
    "round-1",
    "round-1",
    "moderator-review-1",
    "round-2",
    "round-2",
    "moderator-review-2",
    "round-3",
    "round-3",
    "moderator-review-3",
    "final-summary",
  ]);

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
  assert.match(transcript, /## Round 1: Initial Views/);
  assert.match(transcript, /## Round 3: Responses and Updates/);
  assert.match(transcript, /## Moderator Closing Review \(Round 3\)/);
  assert.match(transcript, /## Moderator Final Summary/);
  assert.match(transcript, /Moderator output 4/);
  assert.match(transcript, /## Stop Reason/);
  assert.match(transcript, /Reached maxRounds \(3\)\./);

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

  assert.match(devLog, /"maxRounds": 3/);
  assert.match(devLog, /### round-1: Naval/);
  assert.match(devLog, /### moderator-review-1: Moderator/);
  assert.match(devLog, /### final-summary: Moderator/);
  assert.match(devLog, /#### Response/);
});

test("orchestrator stops early when moderator ends the discussion", async () => {
  const earlyStopConfig = { ...config, maxRounds: 5 };
  const moderatorModel = new FakeModel("Moderator", [review(1), review(2, "end_discussion", "No new progress.")]);
  const minds = [makeMind("naval", "Naval", new FakeModel("Naval"))];

  const result = await runRoundtableSession(earlyStopConfig, minds, { moderatorModel });

  assert.equal(result.rounds.length, 2);
  assert.equal(result.moderatorReviews.length, 2);
  assert.equal(result.finalSummary, "Moderator output 3");
  assert.equal(result.stopReason, "No new progress.");
  assert.deepEqual(result.modelCalls.map((call) => call.phase), ["round-1", "moderator-review-1", "round-2", "moderator-review-2", "final-summary"]);
});

test("orchestrator compresses live round output but emits final summary uncompressed", async () => {
  const oneRoundConfig = { ...config, maxRounds: 1 };
  const navalModel = new FakeModel("Naval");
  const pgModel = new FakeModel("PG");
  const moderatorModel = new FakeModel("Moderator", [review(1)]);
  const compressionModel = new FakeModel("Compression");
  const minds = [makeMind("naval", "Naval", navalModel), makeMind("pg", "Paul Graham", pgModel)];
  const compressedOutputs: CompressedOutput[] = [];
  const speakerOutputs: SpeakerOutput[] = [];

  const result = await runRoundtableSession(oneRoundConfig, minds, {
    moderatorModel,
    compressionModel,
    onCompressedOutput: (output) => compressedOutputs.push(output),
    onSpeakerOutput: (output) => speakerOutputs.push(output),
  });

  assert.equal(compressionModel.calls.length, 3);
  assert.equal(result.finalSummary, "Moderator output 2");
  assert.deepEqual(result.modelCalls.map((call) => call.phase), [
    "round-1",
    "compression",
    "round-1",
    "compression",
    "moderator-review-1",
    "compression",
    "final-summary",
  ]);
  assert.deepEqual(
    compressedOutputs.map((output) => `${output.phaseLabel}: ${output.speaker} -> ${output.content}`),
    [
      "Round 1: Naval -> Compression output 1",
      "Round 1: Paul Graham -> Compression output 2",
      "Moderator Review: Round 1: Moderator -> Compression output 3",
    ],
  );
  assert.deepEqual(
    speakerOutputs.map((output) => `${output.phaseLabel}: ${output.speaker} -> ${output.content}`),
    ["Moderator Final Summary: Moderator -> Moderator output 2"],
  );
  assert.match(compressionModel.calls[0]![1]!.content, /Speaker:\nNaval/);
  assert.doesNotMatch(compressionModel.calls[0]![1]!.content, /Phase:/);
  assert.equal(compressionModel.options[0]?.thinkingEnabled, false);
  assert.equal(compressionModel.options[1]?.thinkingEnabled, false);
  assert.equal(compressionModel.options[2]?.thinkingEnabled, false);
  assert.match(compressionModel.calls[0]![1]!.content, /Naval output 1/);
  assert.match(compressionModel.calls[2]![1]!.content, /Round summary: summary 1/);

  const configWithMinds: SessionConfig = {
    ...oneRoundConfig,
    compressionProvider: "fake",
    minds: [
      { id: "naval", name: "Naval", personaPath: "naval.md", provider: "fake" },
      { id: "pg", name: "Paul Graham", personaPath: "pg.md", provider: "fake" },
    ],
  };
  const transcript = renderTranscript(configWithMinds, result);
  const devLog = renderDevLog(configWithMinds, result);

  assert.doesNotMatch(transcript, /Compression output/);
  assert.match(transcript, /## Moderator Final Summary/);
  assert.match(transcript, /Moderator output 2/);
  assert.match(devLog, /### compression: Naval/);
  assert.match(devLog, /### final-summary: Moderator/);
  assert.match(devLog, /Compression output 1/);
  assert.match(devLog, /"compressionProvider": "fake"/);
});

test("orchestrator emits speaker outputs when compression is disabled", async () => {
  const oneRoundConfig = { ...config, maxRounds: 1 };
  const navalModel = new FakeModel("Naval");
  const pgModel = new FakeModel("PG");
  const moderatorModel = new FakeModel("Moderator", [review(1)]);
  const minds = [makeMind("naval", "Naval", navalModel), makeMind("pg", "Paul Graham", pgModel)];
  const speakerOutputs: SpeakerOutput[] = [];
  const compressedOutputs: CompressedOutput[] = [];

  const result = await runRoundtableSession(oneRoundConfig, minds, {
    moderatorModel,
    onSpeakerOutput: (output) => speakerOutputs.push(output),
    onCompressedOutput: (output) => compressedOutputs.push(output),
  });

  assert.equal(result.modelCalls.length, 4);
  assert.equal(result.finalSummary, "Moderator output 2");
  assert.deepEqual(
    speakerOutputs.map((output) => `${output.phaseLabel}: ${output.speaker} -> ${output.content}`),
    [
      "Round 1: Naval -> Naval output 1",
      "Round 1: Paul Graham -> PG output 1",
      "Moderator Review: Round 1: Moderator -> Round summary: summary 1\n\nProgress note: progress 1\n\nComparison to previous: No previous progress note.\n\nDecision: continue\n\nEnd reason: N/A",
      "Moderator Final Summary: Moderator -> Moderator output 2",
    ],
  );
  assert.deepEqual(compressedOutputs, []);
});

test("orchestrator exposes partial result when a primary model call fails", async () => {
  const minds = [makeMind("naval", "Naval", new FakeModel("Naval")), makeMind("pg", "Paul Graham", new FailingModel())];

  await assert.rejects(
    async () => runRoundtableSession(config, minds, { moderatorModel: new FakeModel("Moderator", [review(1)]) }),
    (error: unknown) => {
      assert.ok(error instanceof SessionRunError);
      assert.equal(error.message, "planned model failure");
      assert.equal(error.partialResult.rounds.length, 1);
      assert.equal(error.partialResult.rounds[0]?.outputs.length, 1);
      assert.equal(error.partialResult.rounds[0]?.outputs[0]?.content, "Naval output 1");
      assert.equal(error.partialResult.modelCalls.length, 2);
      assert.equal(error.partialResult.modelCalls[1]?.phase, "round-1");
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

test("orchestrator exposes partial result when moderator JSON is invalid", async () => {
  const minds = [makeMind("naval", "Naval", new FakeModel("Naval"))];

  await assert.rejects(
    async () => runRoundtableSession(config, minds, { moderatorModel: new FakeModel("Moderator", ["not json"]) }),
    (error: unknown) => {
      assert.ok(error instanceof SessionRunError);
      assert.equal(error.message, "Moderator review for round 1 was not valid JSON");
      assert.equal(error.partialResult.rounds[0]?.outputs[0]?.content, "Naval output 1");
      assert.equal(error.partialResult.moderatorReviews.length, 0);
      assert.equal(error.partialResult.modelCalls[1]?.phase, "moderator-review-1");
      assert.equal(error.partialResult.modelCalls[1]?.response, "not json");
      return true;
    },
  );
});

test("orchestrator records prompts while dummy models return deterministic outputs", async () => {
  const dummyConfig: SessionConfig = {
    topic: "Should I start a company?",
    context: "I have savings. I want autonomy.",
    maxRounds: 2,
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

  assert.equal(result.rounds[0]?.outputs[0]?.content, "[andrej-karpathy, round 1]");
  assert.equal(result.rounds[0]?.outputs[1]?.content, "[trump, round 1]");
  assert.equal(result.rounds[1]?.outputs[0]?.content, "[andrej-karpathy, round 2]");
  assert.equal(result.rounds[1]?.outputs[1]?.content, "[trump, round 2]");
  assert.equal(result.moderatorReviews[1]?.roundSummary, "[moderator, round 2 summary]");
  assert.equal(result.finalSummary, "[moderator, final summary]");
  assert.equal(result.modelCalls.length, 7);
  assert.deepEqual(result.modelCalls.map((call) => call.phase), [
    "round-1",
    "round-1",
    "moderator-review-1",
    "round-2",
    "round-2",
    "moderator-review-2",
    "final-summary",
  ]);
  assert.match(result.modelCalls[0]!.messages[0]!.content, /Andrej Karpathy persona/);
  assert.match(result.modelCalls[0]!.messages[1]!.content, /Should I start a company/);
});
