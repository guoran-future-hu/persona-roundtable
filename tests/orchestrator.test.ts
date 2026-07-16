import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionConfig } from "../src/config";
import type { ChatMessage, ChatModel } from "../src/models/types";
import {
  buildFinalSummaryMessages,
  buildFollowUpRoundMessages,
  buildModeratorMessages,
  buildRoundOneMessages,
  parseDynamicModeratorCheck,
  parseDynamicSpeakerResponse,
  parseModeratorReview,
  parseUrgencyResponse,
  runRoundtableSession,
  SessionRunError,
  type CompressedOutput,
  type ModeratorReview,
  type RoundResult,
  type SpeakerOutput,
} from "../src/orchestrator";
import type { LoadedMind } from "../src/personas";
import { renderDevLog, renderTranscript } from "../src/transcript";

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
    progressAssessment: `progress ${roundNumber}`,
    decision,
    endReason,
  });
}

test("round one prompt includes session data but no previous opinions", () => {
  const model = new FakeModel("Naval");
  const minds = [makeMind("naval", "Naval", model), makeMind("pg", "Paul Graham", new FakeModel("PG"))];
  const messages = buildRoundOneMessages(config.topic, String(config.context), "Use English.", minds[0]!, minds);

  assert.match(messages[0]!.content, /\npg\n/);
  assert.match(messages[0]!.content, /naval\npg/);
  assert.match(messages[0]!.content, /<output_language>\nUse English\.\n<\/output_language>/);
  assert.match(messages[0]!.content, /Should I start a company/);
  assert.match(messages[0]!.content, /I have savings/);
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
      progressAssessment: "defined the core tradeoff",
      decision: "continue",
      endReason: "",
    },
  ];
  const messages = buildFollowUpRoundMessages(config.topic, String(config.context), "Use English.", 2, mind, previousRounds, reviews);

  assert.match(messages[1]!.content, /<speech turn="1" speaker="naval">\ninitial naval/);
  assert.match(messages[1]!.content, /<speech turn="1" speaker="pg">\ninitial pg/);
  assert.match(messages[1]!.content, /<moderator-review round="1">\nSummary: opening(?: positions)?\nDecision: continue/);
  assert.match(messages[0]!.content, /Should I start a company/);
  assert.match(messages[0]!.content, /I have savings/);
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
    [currentRound],
    [
      {
        roundNumber: 1,
        roundSummary: "opening",
        progressAssessment: "same few points",
        decision: "continue",
        endReason: "",
      },
    ],
  );

  assert.doesNotMatch(messages[0]!.content, /Can end discussion/);
  assert.match(messages[0]!.content, /updated naval/);
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
      progressAssessment: "defined the core tradeoff",
      decision: "continue",
      endReason: "",
    },
  ];

  const messages = buildFinalSummaryMessages(config.topic, String(config.context), "Use English.", rounds, reviews, "Reached maxRounds (1).");

  assert.match(messages[0]!.content, /Produce a final synthesis/);
  assert.match(messages[0]!.content, /Should I start a company/);
  assert.match(messages[1]!.content, /Reached maxRounds \(1\)\./);
  assert.match(messages[0]!.content, /<moderator-review round="1">\nSummary: opening(?: positions)?\nDecision: continue/);
  assert.match(messages[0]!.content, /<speech turn="1" speaker="naval">\ninitial naval/);
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
      outputLanguage: "Use English.",
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
  assert.match(compressionModel.calls[0]![1]!.content, /<speaker_output>\nNaval output 1\n<\/speaker_output>/);
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
      "Moderator Review: Round 1: Moderator -> Round summary: summary 1\n\nProgress assessment: progress 1\n\nDecision: continue\n\nEnd reason: N/A",
      "Moderator Final Summary: Moderator -> Moderator output 2",
    ],
  );
  assert.deepEqual(compressedOutputs, []);
});

test("orchestrator honors compressionEnabled=false even when a model is supplied", async () => {
  const oneRoundConfig = { ...config, maxRounds: 1, compressionEnabled: false };
  const navalModel = new FakeModel("Naval");
  const pgModel = new FakeModel("PG");
  const moderatorModel = new FakeModel("Moderator", [review(1)]);
  const compressionModel = new FakeModel("Compression");
  const compressedOutputs: CompressedOutput[] = [];
  const minds = [makeMind("naval", "Naval", navalModel), makeMind("pg", "Paul Graham", pgModel)];

  const result = await runRoundtableSession(oneRoundConfig, minds, {
    moderatorModel,
    compressionModel,
    onCompressedOutput: (output) => compressedOutputs.push(output),
  });

  assert.equal(compressionModel.calls.length, 0);
  assert.deepEqual(compressedOutputs, []);
  assert.doesNotMatch(JSON.stringify(result.modelCalls), /compression/);
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
    async () => runRoundtableSession(config, minds, { moderatorModel: new FakeModel("Moderator", ["not json", "still not json"]) }),
    (error: unknown) => {
      assert.ok(error instanceof SessionRunError);
      assert.equal(error.message, "Moderator review for round 1 was not valid JSON");
      assert.equal(error.partialResult.rounds[0]?.outputs[0]?.content, "Naval output 1");
      assert.equal(error.partialResult.moderatorReviews.length, 0);
      assert.equal(error.partialResult.modelCalls[1]?.phase, "moderator-review-1");
      assert.equal(error.partialResult.modelCalls.length, 3);
      assert.equal(error.partialResult.modelCalls[1]?.successful, false);
      assert.equal(error.partialResult.modelCalls[2]?.response, "still not json");
      return true;
    },
  );
});

test("structured calls repair once without exposing the rejected attempt in the transcript", async () => {
  const minds = [makeMind("naval", "Naval", new FakeModel("Naval"))];
  const moderator = new FakeModel("Moderator", ["not json", review(1), "final summary"]);

  const result = await runRoundtableSession({ ...config, maxRounds: 1 }, minds, { moderatorModel: moderator });
  assert.equal(result.moderatorReviews[0]?.roundSummary, "summary 1");
  assert.equal(result.modelCalls[1]?.successful, false);
  assert.equal(result.modelCalls[1]?.attempt, 1);
  assert.equal(result.modelCalls[2]?.successful, true);
  assert.equal(result.modelCalls[2]?.attempt, 2);

  const configWithMinds: SessionConfig = {
    ...config,
    maxRounds: 1,
    minds: [{ id: "naval", name: "Naval", personaPath: "naval.md", provider: "fake" }],
  };
  assert.doesNotMatch(renderTranscript(configWithMinds, result), /not json/);
  assert.match(renderDevLog(configWithMinds, result), /Validation: failed/);
});
function dynamicCheck(
  action: "continue" | "summarize" | "end_discussion",
  fields: Partial<{
    checkpointSummary: string;
    progressAssessment: string;
    endReason: string;
  }> = {},
): string {
  return JSON.stringify({
    action,
    checkpointSummary: fields.checkpointSummary ?? "",
    progressAssessment: fields.progressAssessment ?? "",
    endReason: fields.endReason ?? "",
  });
}

test("dynamic mode polls urgency before moderator checks and preserves invitations", async () => {
  const dynamicConfig: SessionConfig = {
    ...config,
    discussionMode: "dynamic",
    maxTurns: 8,
  };
  const alphaModel = new FakeModel("Alpha", [
    "alpha opening",
    JSON.stringify({ content: "alpha response", inviteMindId: "beta" }),
  ]);
  const betaModel = new FakeModel("Beta", [
    "beta opening",
    JSON.stringify({ content: "beta invited response", inviteMindId: null }),
  ]);
  const gammaModel = new FakeModel("Gamma", ["gamma opening"]);
  const urgencyModel = new FakeModel("Urgency", [
    JSON.stringify({ urgency: "strong_need_to_respond" }),
    JSON.stringify({ urgency: "minor_update" }),
    JSON.stringify({ urgency: "minor_update" }),
    JSON.stringify({ urgency: "no_new_comment" }),
  ]);
  const moderatorModel = new FakeModel("Moderator", [
    review(1),
    dynamicCheck("continue"),
    dynamicCheck("end_discussion", { endReason: "Enough evidence." }),
    "dynamic final summary",
  ]);
  const compressionModel = new FakeModel("Compression");
  const minds = [
    makeMind("alpha", "Alpha", alphaModel),
    makeMind("beta", "Beta", betaModel),
    makeMind("gamma", "Gamma", gammaModel),
  ];

  const result = await runRoundtableSession(dynamicConfig, minds, { moderatorModel, compressionModel, urgencyModel });

  assert.equal(result.discussionMode, "dynamic");
  assert.equal(result.effectiveMaxTurns, 8);
  assert.deepEqual(result.rounds[0]?.outputs.map((output) => output.mindName), ["Alpha", "Beta", "Gamma"]);
  assert.equal(result.urgencyPolls.length, 2);
  assert.deepEqual(
    result.urgencyPolls[0]?.signals.map((signal) => [signal.mindId, signal.urgency]),
    [
      ["alpha", "strong_need_to_respond"],
      ["beta", "minor_update"],
    ],
  );
  assert.equal(result.urgencyPolls[0]?.selectedMindId, "alpha");
  assert.deepEqual(
    result.dynamicTurns.map((turn) => ({
      speaker: turn.mindId,
      method: turn.selectionMethod,
      invite: turn.inviteMindId,
      invitedBy: turn.invitedByMindId,
    })),
    [
      { speaker: "alpha", method: "urgency", invite: "beta", invitedBy: undefined },
      { speaker: "beta", method: "invitation", invite: null, invitedBy: "alpha" },
    ],
  );
  assert.deepEqual(result.dynamicModeratorChecks.map((check) => check.action), ["continue", "end_discussion"]);
  assert.equal(result.stopReason, "Enough evidence.");
  assert.equal(result.finalSummary, "dynamic final summary");
  assert.equal(urgencyModel.calls.length, 4);
  assert.equal(urgencyModel.options[0]?.maxOutputTokens, 128);
  assert.equal(urgencyModel.options[0]?.thinkingEnabled, false);
  assert.equal(alphaModel.options.length, 2);
  assert.equal(compressionModel.calls.length, 6);
  assert.equal(result.modelCalls.filter((call) => call.phase === "compression").length, 6);
  assert.match(moderatorModel.calls[1]![0]!.content, /approximately one summary per 3 post-opening speeches/);
  assert.match(moderatorModel.calls[2]![0]!.content, /alpha response/);
  assert.match(moderatorModel.calls[2]![0]!.content, /beta invited response/);

  const transcript = renderTranscript(
    {
      ...dynamicConfig,
      minds: [
        { id: "alpha", name: "Alpha", personaPath: "alpha.md", provider: "fake" },
        { id: "beta", name: "Beta", personaPath: "beta.md", provider: "fake" },
        { id: "gamma", name: "Gamma", personaPath: "gamma.md", provider: "fake" },
      ],
    },
    result,
  );
  assert.match(transcript, /### Urgency Poll After Turn 3/);
  assert.match(transcript, /Alpha: strong_need_to_respond/);
  assert.match(transcript, /## Turn 4: Alpha/);
  assert.ok(transcript.includes("Invitation: Beta (beta)"));
  assert.match(transcript, /Selected by: invited by Alpha/);
  assert.match(transcript, /Action: end_discussion/);
});

test("dynamic moderator checkpoints reset cadence and all-quiet urgency ends the session", async () => {
  const dynamicConfig: SessionConfig = {
    ...config,
    discussionMode: "dynamic",
    maxTurns: 7,
  };
  const alphaModel = new FakeModel("Alpha", [
    "alpha opening",
    JSON.stringify({ urgency: "minor_update" }),
    JSON.stringify({ urgency: "no_new_comment" }),
  ]);
  const betaModel = new FakeModel("Beta", [
    "beta opening",
    JSON.stringify({ urgency: "strong_need_to_respond" }),
    JSON.stringify({ content: "beta invited response", inviteMindId: null }),
    JSON.stringify({ urgency: "minor_update" }),
  ]);
  const gammaModel = new FakeModel("Gamma", [
    "gamma opening",
    JSON.stringify({ urgency: "no_new_comment" }),
  ]);
  const moderatorModel = new FakeModel("Moderator", [
    review(1),
    dynamicCheck("summarize", {
      checkpointSummary: "new checkpoint",
      progressAssessment: "meaningful progress",
    }),
    "quiet final summary",
  ]);
  const minds = [
    makeMind("alpha", "Alpha", alphaModel),
    makeMind("beta", "Beta", betaModel),
    makeMind("gamma", "Gamma", gammaModel),
  ];

  const result = await runRoundtableSession(dynamicConfig, minds, { moderatorModel });

  assert.equal(result.dynamicTurns.length, 1);
  assert.equal(result.dynamicTurns[0]?.mindId, "beta");
  assert.equal(result.dynamicModeratorChecks[0]?.action, "summarize");
  assert.equal(result.dynamicModeratorChecks[0]?.turnsSinceCheckpoint, 1);
  assert.equal(result.moderatorReviews.length, 2);
  assert.equal(result.moderatorReviews[1]?.roundSummary, "new checkpoint");
  assert.equal(result.urgencyPolls.length, 2);
  assert.equal(result.urgencyPolls[1]?.selectedMindId, undefined);
  assert.equal(result.stopReason, "All other minds reported no new comment.");
  assert.equal(result.finalSummary, "quiet final summary");

  const transcript = renderTranscript(
    {
      ...dynamicConfig,
      minds: [
        { id: "alpha", name: "Alpha", personaPath: "alpha.md", provider: "fake" },
        { id: "beta", name: "Beta", personaPath: "beta.md", provider: "fake" },
        { id: "gamma", name: "Gamma", personaPath: "gamma.md", provider: "fake" },
      ],
    },
    result,
  );
  assert.match(transcript, /Checkpoint summary: new checkpoint/);
  assert.match(transcript, /Next speaker: None/);
});

test("dynamic mode applies explicit opening-inclusive caps and computes fallback caps", async () => {
  const cappedConfig: SessionConfig = {
    ...config,
    discussionMode: "dynamic",
    maxTurns: 3,
  };
  const cappedMinds = [
    makeMind("alpha", "Alpha", new FakeModel("Alpha", ["alpha opening"])),
    makeMind("beta", "Beta", new FakeModel("Beta", ["beta opening"])),
    makeMind("gamma", "Gamma", new FakeModel("Gamma", ["gamma opening"])),
  ];
  const cappedResult = await runRoundtableSession(cappedConfig, cappedMinds, {
    moderatorModel: new FakeModel("Moderator", [review(1), "capped final"]),
  });

  assert.equal(cappedResult.effectiveMaxTurns, 3);
  assert.equal(cappedResult.stopReason, "Reached maxTurns (3).");
  assert.equal(cappedResult.urgencyPolls.length, 0);

  const fallbackConfig: SessionConfig = {
    ...config,
    discussionMode: "dynamic",
    maxRounds: 2,
    maxTurns: undefined,
  };
  const fallbackMinds = [
    makeMind("alpha", "Alpha", new FakeModel("Alpha", [
      "alpha opening",
      JSON.stringify({ urgency: "no_new_comment" }),
    ])),
    makeMind("beta", "Beta", new FakeModel("Beta", [
      "beta opening",
      JSON.stringify({ urgency: "no_new_comment" }),
    ])),
    makeMind("gamma", "Gamma", new FakeModel("Gamma", ["gamma opening"])),
  ];
  const fallbackResult = await runRoundtableSession(fallbackConfig, fallbackMinds, {
    moderatorModel: new FakeModel("Moderator", [review(1), "fallback final"]),
  });

  assert.equal(fallbackResult.effectiveMaxTurns, 6);
  assert.equal(fallbackResult.stopReason, "All other minds reported no new comment.");
});

test("dynamic structured response parsers reject invalid scheduling data", () => {
  const minds = [
    { id: "alpha", name: "Alpha" },
    { id: "beta", name: "Beta" },
    { id: "gamma", name: "Gamma" },
  ];

  assert.throws(
    () =>
      parseDynamicSpeakerResponse(
        JSON.stringify({ content: "response", inviteMindId: "alpha" }),
        4,
        minds[0]!,
        minds,
      ),
    /cannot invite the current mind/,
  );
  assert.throws(
    () =>
      parseDynamicSpeakerResponse(
        JSON.stringify({ content: "response", inviteMindId: "missing" }),
        4,
        minds[0]!,
        minds,
      ),
    /invited unknown mind ID/,
  );
  assert.deepEqual(
    parseDynamicSpeakerResponse("嗯。类型不同。\n\n{\"inviteMindId\":\"beta\"}", 4, minds[0]!, minds),
    { content: "嗯。类型不同。", inviteMindId: "beta" },
  );
  assert.throws(
    () => parseUrgencyResponse(JSON.stringify({ urgency: "urgent" }), 3, minds[0]!),
    /invalid urgency/,
  );
  assert.deepEqual(parseDynamicModeratorCheck(JSON.stringify({ action: "continue" }), 4, 1), {
    afterTurnNumber: 4,
    turnsSinceCheckpoint: 1,
    action: "continue",
    checkpointSummary: "",
    progressAssessment: "",
    endReason: "",
  });
  assert.throws(
    () => parseDynamicModeratorCheck(dynamicCheck("continue", { checkpointSummary: "unexpected" }), 4, 1),
    /requires empty summary and end fields/,
  );
  assert.throws(
    () => parseDynamicModeratorCheck(dynamicCheck("summarize"), 4, 1),
    /requires summary fields/,
  );
});
test("dynamic mode preserves scheduling state when a structured speech is invalid", async () => {
  const dynamicConfig: SessionConfig = {
    ...config,
    discussionMode: "dynamic",
    maxTurns: 6,
  };
  const minds = [
    makeMind("alpha", "Alpha", new FakeModel("Alpha", [
      "alpha opening",
      JSON.stringify({ urgency: "strong_need_to_respond" }),
      "not json",
      "still not json",
    ])),
    makeMind("beta", "Beta", new FakeModel("Beta", [
      "beta opening",
      JSON.stringify({ urgency: "minor_update" }),
    ])),
    makeMind("gamma", "Gamma", new FakeModel("Gamma", ["gamma opening"])),
  ];

  await assert.rejects(
    async () =>
      runRoundtableSession(dynamicConfig, minds, {
        moderatorModel: new FakeModel("Moderator", [review(1)]),
      }),
    (error: unknown) => {
      assert.ok(error instanceof SessionRunError);
      assert.match(error.message, /Dynamic response for turn 4 was not valid JSON/);
      assert.equal(error.partialResult.rounds.length, 1);
      assert.equal(error.partialResult.urgencyPolls.length, 1);
      assert.equal(error.partialResult.urgencyPolls[0]?.selectedMindId, "alpha");
      assert.equal(error.partialResult.dynamicTurns.length, 0);
      assert.equal(error.partialResult.modelCalls.at(-1)?.phase, "dynamic-turn-4");
      assert.equal(error.partialResult.modelCalls.at(-1)?.response, "still not json");
      return true;
    },
  );
});