import type { SessionConfig } from "./config";
import type { LoadedMind } from "./personas";
import { defaultPromptTemplates } from "./prompt-templates";
import {
  buildCompressionMessages,
  buildDynamicModeratorMessages,
  buildDynamicTurnMessages,
  buildFinalSummaryMessages,
  buildFollowUpRoundMessages,
  buildModeratorMessages,
  buildRoundOneMessages,
  buildUrgencyMessages,
  formatDiscussionHistory,
  serializeContext,
} from "./discussion-prompts";
import {
  dynamicModeratorCheckSpec,
  dynamicSpeakerResponseSpec,
  parseDynamicModeratorCheck,
  parseDynamicSpeakerResponse,
  parseJsonObject,
  parseModeratorReview,
  parseUrgencyResponse,
  urgencySpec,
  moderatorReviewSpec,
} from "./structured-output";
import { generateAndLog, generateStructuredAndLog } from "./model-calls";
import { formatDynamicModeratorCheck, formatDynamicModeratorCheckpoint, formatModeratorReview, formatPhaseLabel } from "./session-formatters";
import { selectNextByUrgency } from "./dynamic-scheduling";
import { handleSpeakerOutput } from "./speaker-output";
import type {
  CompressedOutput,
  DiscussionHistoryState,
  DynamicModeratorCheck,
  DynamicSessionState,
  DynamicSelectionMethod,
  DynamicSpeakerResponse,
  DynamicTurn,
  ModelCallLog,
  ModelCallPhase,
  ModeratorDecision,
  ModeratorReview,
  NextSpeakerSelection,
  RoundOutput,
  RoundResult,
  RunOptions,
  SessionResult,
  SpeakerOutput,
  SpeakerOutputPhase,
  UrgencyLevel,
  UrgencyPoll,
  UrgencySignal,
} from "./session-types";

const MAIN_RESPONSE_MAX_OUTPUT_TOKENS = 8192;
const MODERATOR_REVIEW_MAX_OUTPUT_TOKENS = 1400;
const FINAL_SUMMARY_MAX_OUTPUT_TOKENS = 2200;
export type {
  CompressedOutput,
  DiscussionHistoryState,
  DynamicModeratorCheck,
  DynamicSessionState,
  DynamicSelectionMethod,
  DynamicSpeakerResponse,
  DynamicTurn,
  ModelCallLog,
  ModelCallPhase,
  ModeratorDecision,
  ModeratorReview,
  NextSpeakerSelection,
  RoundOutput,
  RoundResult,
  RunOptions,
  SessionResult,
  SpeakerOutput,
  SpeakerOutputPhase,
  UrgencyLevel,
  UrgencyPoll,
  UrgencySignal,
} from "./session-types";

export {
  buildCompressionMessages,
  buildDynamicModeratorMessages,
  buildDynamicTurnMessages,
  buildFinalSummaryMessages,
  buildFollowUpRoundMessages,
  buildModeratorMessages,
  buildRoundOneMessages,
  buildUrgencyMessages,
  formatDiscussionHistory,
  serializeContext,
  dynamicModeratorCheckSpec,
  dynamicSpeakerResponseSpec,
  parseDynamicModeratorCheck,
  parseDynamicSpeakerResponse,
  parseJsonObject,
  parseModeratorReview,
  parseUrgencyResponse,
  urgencySpec,
  moderatorReviewSpec,
  formatDynamicModeratorCheck,
  formatDynamicModeratorCheckpoint,
  formatModeratorReview,
  formatPhaseLabel,
};

export class SessionRunError extends Error {
  readonly partialResult: SessionResult;

  constructor(message: string, partialResult: SessionResult) {
    super(message);
    this.name = "SessionRunError";
    this.partialResult = partialResult;
  }
}

export async function runRoundtableSession(
  config: SessionConfig,
  minds: LoadedMind[],
  options: RunOptions,
): Promise<SessionResult> {
  const effectiveOptions = config.compressionEnabled === false ? { ...options, compressionModel: undefined } : options;
  if ((config.discussionMode ?? "simple") === "dynamic") {
    return runDynamicRoundtableSession(config, minds, effectiveOptions);
  }

  return runSimpleRoundtableSession(config, minds, effectiveOptions);
}

async function runSimpleRoundtableSession(
  config: SessionConfig,
  minds: LoadedMind[],
  options: RunOptions,
): Promise<SessionResult> {
  const context = serializeContext(config.context);
  const outputLanguage = config.outputLanguage ?? "Use the user's language unless the persona has a stronger reason to do otherwise.";
  const rounds: RoundResult[] = [];
  const moderatorReviews: ModeratorReview[] = [];
  const modelCalls: ModelCallLog[] = [];
  const promptTemplates = options.promptTemplates ?? defaultPromptTemplates;
  let stopReason: string | undefined;
  let finalSummary: string | undefined;

  try {
    for (let roundNumber = 1; roundNumber <= config.maxRounds; roundNumber += 1) {
      const round: RoundResult = { roundNumber, outputs: [] };
      rounds.push(round);

      for (const mind of minds) {
        options.onProgress?.(`Round ${roundNumber}: ${mind.name}`);
        const messages =
          roundNumber === 1
            ? buildRoundOneMessages(config.topic, context, outputLanguage, mind, minds, promptTemplates)
            : buildFollowUpRoundMessages(config.topic, context, outputLanguage, roundNumber, mind, rounds.slice(0, -1), moderatorReviews, promptTemplates);
        const content = await generateAndLog({
          phase: roundPhase(roundNumber),
          speaker: mind.name,
          model: mind.model,
          messages,
          modelCalls,
          generateOptions: { maxOutputTokens: MAIN_RESPONSE_MAX_OUTPUT_TOKENS },
        });
        round.outputs.push({ mindId: mind.id, mindName: mind.name, content });
        await handleSpeakerOutput({
          topic: config.topic,
          outputLanguage,
          phase: roundPhase(roundNumber),
          speaker: mind.name,
          content,
          modelCalls,
          options,
          promptTemplates,
        });
        await notifySessionUpdate(config, options, modelCalls, rounds, moderatorReviews);
      }

      options.onProgress?.(`Moderator review: Round ${roundNumber}`);
      const moderatorMessages = buildModeratorMessages(
        config.topic,
        context,
        outputLanguage,
        rounds,
        moderatorReviews,
        promptTemplates,
      );
      const moderatorReview = await generateStructuredAndLog({
        phase: moderatorReviewPhase(roundNumber),
        speaker: "Moderator",
        model: options.moderatorModel,
        messages: moderatorMessages,
        modelCalls,
        generateOptions: { maxOutputTokens: MODERATOR_REVIEW_MAX_OUTPUT_TOKENS },
        structuredOutput: moderatorReviewSpec(roundNumber),
        parse: (raw) => parseModeratorReview(raw, roundNumber),
      });
      moderatorReviews.push(moderatorReview);
      await handleSpeakerOutput({
        topic: config.topic,
        outputLanguage,
        phase: moderatorReviewPhase(roundNumber),
        speaker: "Moderator",
        content: formatModeratorReview(moderatorReview, promptTemplates),
        modelCalls,
        options,
        promptTemplates,
      });
      await notifySessionUpdate(config, options, modelCalls, rounds, moderatorReviews);
      if (roundNumber >= config.maxRounds) {
        stopReason = `Reached maxRounds (${config.maxRounds}).`;
        break;
      }

      if (roundNumber > 1 && moderatorReview.decision === "end_discussion") {
        stopReason = endDiscussion(moderatorReview);
        break;
      }
    }

    options.onProgress?.("Moderator final summary");
    const finalSummaryMessages = buildFinalSummaryMessages(
      config.topic,
      context,
      outputLanguage,
      rounds,
      moderatorReviews,
      stopReason ?? "Discussion ended.",
      promptTemplates,
    );
    finalSummary = await generateAndLog({
      phase: "final-summary",
      speaker: "Moderator",
      model: options.moderatorModel,
      messages: finalSummaryMessages,
      modelCalls,
      generateOptions: { maxOutputTokens: FINAL_SUMMARY_MAX_OUTPUT_TOKENS },
    });
    options.onSpeakerOutput?.({
      phase: "final-summary",
      phaseLabel: formatPhaseLabel("final-summary"),
      speaker: "Moderator",
      content: finalSummary,
    });

    await notifySessionUpdate(config, options, modelCalls, rounds, moderatorReviews, finalSummary, stopReason);
    return buildSessionResult(config, modelCalls, rounds, moderatorReviews, finalSummary, stopReason);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SessionRunError(message, buildSessionResult(config, modelCalls, rounds, moderatorReviews, finalSummary, stopReason, message));
  }
}

async function runDynamicRoundtableSession(
  config: SessionConfig,
  minds: LoadedMind[],
  options: RunOptions,
): Promise<SessionResult> {
  const context = serializeContext(config.context);
  const outputLanguage = config.outputLanguage ?? "Use the user's language unless the persona has a stronger reason to do otherwise.";
  const rounds: RoundResult[] = [];
  const moderatorReviews: ModeratorReview[] = [];
  const modelCalls: ModelCallLog[] = [];
  const promptTemplates = options.promptTemplates ?? defaultPromptTemplates;
  const dynamicState: DynamicSessionState = {
    effectiveMaxTurns: config.maxTurns ?? config.maxRounds * minds.length,
    dynamicTurns: [],
    urgencyPolls: [],
    dynamicModeratorChecks: [],
  };
  let stopReason: string | undefined;
  let finalSummary: string | undefined;

  try {
    if (minds.length < 3) {
      throw new Error("dynamic discussionMode requires at least three active minds");
    }

    if (dynamicState.effectiveMaxTurns < minds.length) {
      throw new Error("maxTurns must be at least the active mind count in dynamic mode");
    }

    const openingRound: RoundResult = { roundNumber: 1, outputs: [] };
    rounds.push(openingRound);

    for (const mind of minds) {
      options.onProgress?.("Round 1: " + mind.name);
      const messages = buildRoundOneMessages(config.topic, context, outputLanguage, mind, minds, promptTemplates);
      const content = await generateAndLog({
        phase: roundPhase(1),
        speaker: mind.name,
        model: mind.model,
        messages,
        modelCalls,
        generateOptions: { maxOutputTokens: MAIN_RESPONSE_MAX_OUTPUT_TOKENS },
      });
      openingRound.outputs.push({ mindId: mind.id, mindName: mind.name, content });
      await handleSpeakerOutput({
        topic: config.topic,
        outputLanguage,
        phase: roundPhase(1),
        speaker: mind.name,
        content,
        modelCalls,
        options,
        promptTemplates,
      });
      await notifySessionUpdate(config, options, modelCalls, rounds, moderatorReviews, undefined, stopReason, undefined, dynamicState);
    }

    options.onProgress?.("Moderator review: Round 1");
    const openingModeratorMessages = buildModeratorMessages(
      config.topic,
      context,
      outputLanguage,
      rounds,
      moderatorReviews,
      promptTemplates,
    );
    const openingReview = await generateStructuredAndLog({
      phase: moderatorReviewPhase(1),
      speaker: "Moderator",
      model: options.moderatorModel,
      messages: openingModeratorMessages,
      modelCalls,
      generateOptions: { maxOutputTokens: MODERATOR_REVIEW_MAX_OUTPUT_TOKENS },
      structuredOutput: moderatorReviewSpec(1),
      parse: (raw) => parseModeratorReview(raw, 1),
    });
    moderatorReviews.push(openingReview);
    await handleSpeakerOutput({
      topic: config.topic,
      outputLanguage,
      phase: moderatorReviewPhase(1),
      speaker: "Moderator",
      content: formatModeratorReview(openingReview, promptTemplates),
      modelCalls,
      options,
      promptTemplates,
    });
    await notifySessionUpdate(config, options, modelCalls, rounds, moderatorReviews, undefined, stopReason, undefined, dynamicState);

    let turnNumber = minds.length;
    let turnsSinceCheckpoint = 0;
    let nextSelection: NextSpeakerSelection | undefined;

    if (turnNumber >= dynamicState.effectiveMaxTurns) {
      stopReason = "Reached maxTurns (" + dynamicState.effectiveMaxTurns + ").";
    } else {
      nextSelection = await selectNextByUrgency({
        afterTurnNumber: turnNumber,
        previousMindId: minds[minds.length - 1]!.id,
        config,
        context,
        outputLanguage,
        minds,
        rounds,
        moderatorReviews,
        modelCalls,
        urgencyPolls: dynamicState.urgencyPolls,
        dynamicTurns: dynamicState.dynamicTurns,
        dynamicModeratorChecks: dynamicState.dynamicModeratorChecks,
        promptTemplates,
        options,
      });

      if (!nextSelection) {
        stopReason = "All other minds reported no new comment.";
      }
    }

    while (nextSelection && stopReason === undefined) {
      turnNumber += 1;
      const selection = nextSelection;
      const selectionReason = formatSelectionReason(selection, minds);
      options.onProgress?.("Turn " + turnNumber + ": " + selection.mind.name);

      const messages = buildDynamicTurnMessages(
        config.topic,
        context,
        outputLanguage,
        selection.mind,
        minds,
        rounds,
        moderatorReviews,
        selectionReason,
        {
          dynamicTurns: dynamicState.dynamicTurns,
          urgencyPolls: dynamicState.urgencyPolls,
          dynamicModeratorChecks: dynamicState.dynamicModeratorChecks,
        },
        promptTemplates,
      );
      const response = await generateStructuredAndLog({
        phase: dynamicTurnPhase(turnNumber),
        speaker: selection.mind.name,
        model: selection.mind.model,
        messages,
        modelCalls,
        generateOptions: { maxOutputTokens: MAIN_RESPONSE_MAX_OUTPUT_TOKENS },
        structuredOutput: dynamicSpeakerResponseSpec(selection.mind.id, minds),
        parse: (raw) => parseDynamicSpeakerResponse(raw, turnNumber, selection.mind, minds),
      });
      const round: RoundResult = {
        roundNumber: turnNumber,
        outputs: [{ mindId: selection.mind.id, mindName: selection.mind.name, content: response.content }],
      };
      rounds.push(round);

      const turn: DynamicTurn = {
        turnNumber,
        mindId: selection.mind.id,
        mindName: selection.mind.name,
        content: response.content,
        selectionMethod: selection.method,
        selectedUrgency: selection.selectedUrgency,
        invitedByMindId: selection.invitedByMindId,
        inviteMindId: response.inviteMindId,
      };
      dynamicState.dynamicTurns.push(turn);

      await handleSpeakerOutput({
        topic: config.topic,
        outputLanguage,
        phase: dynamicTurnPhase(turnNumber),
        speaker: selection.mind.name,
        content: response.content,
        modelCalls,
        options,
        promptTemplates,
      });
      await notifySessionUpdate(config, options, modelCalls, rounds, moderatorReviews, undefined, stopReason, undefined, dynamicState);

      turnsSinceCheckpoint += 1;

      if (turnNumber >= dynamicState.effectiveMaxTurns) {
        stopReason = "Reached maxTurns (" + dynamicState.effectiveMaxTurns + ").";
        break;
      }

      // Poll for an uninvited response before asking the moderator whether to end.
      // This lets a mind with a strong need to respond keep a live disagreement going.
      if (response.inviteMindId !== null) {
        const invitedMind = minds.find((mind) => mind.id === response.inviteMindId)!;
        options.onProgress?.(`[${selection.mind.name}] invites [${invitedMind.name}] as follow-up speaker`);
        nextSelection = {
          mind: invitedMind,
          method: "invitation",
          invitedByMindId: selection.mind.id,
        };
      } else {
        nextSelection = await selectNextByUrgency({
          afterTurnNumber: turnNumber,
          previousMindId: selection.mind.id,
          config,
          context,
          outputLanguage,
          minds,
          rounds,
          moderatorReviews,
          modelCalls,
          urgencyPolls: dynamicState.urgencyPolls,
          dynamicTurns: dynamicState.dynamicTurns,
          dynamicModeratorChecks: dynamicState.dynamicModeratorChecks,
          promptTemplates,
          options,
        });
      }

      const moderatorMessages = buildDynamicModeratorMessages(
        config.topic,
        context,
        outputLanguage,
        rounds,
        turnsSinceCheckpoint,
        minds.length,
        moderatorReviews,
        {
          dynamicTurns: dynamicState.dynamicTurns,
          urgencyPolls: dynamicState.urgencyPolls,
          dynamicModeratorChecks: dynamicState.dynamicModeratorChecks,
        },
        promptTemplates,
      );
      const moderatorCheck = await generateStructuredAndLog({
        phase: moderatorCheckPhase(turnNumber),
        speaker: "Moderator",
        model: options.moderatorModel,
        messages: moderatorMessages,
        modelCalls,
        generateOptions: { maxOutputTokens: MODERATOR_REVIEW_MAX_OUTPUT_TOKENS },
        structuredOutput: dynamicModeratorCheckSpec,
        parse: (raw) => parseDynamicModeratorCheck(raw, turnNumber, turnsSinceCheckpoint),
      });
      dynamicState.dynamicModeratorChecks.push(moderatorCheck);

      if (moderatorCheck.action === "summarize") {
        const checkpointReview: ModeratorReview = {
          roundNumber: turnNumber,
          roundSummary: moderatorCheck.checkpointSummary,
          progressAssessment: moderatorCheck.progressAssessment,
          decision: "continue",
          endReason: "",
        };
        moderatorReviews.push(checkpointReview);
        await handleSpeakerOutput({
          topic: config.topic,
          outputLanguage,
          phase: moderatorCheckPhase(turnNumber),
          speaker: "Moderator",
          content: formatDynamicModeratorCheckpoint(moderatorCheck),
          modelCalls,
          options,
          promptTemplates,
        });
        turnsSinceCheckpoint = 0;
      }
      await notifySessionUpdate(config, options, modelCalls, rounds, moderatorReviews, undefined, stopReason, undefined, dynamicState);

      if (moderatorCheck.action === "end_discussion") {
        stopReason = moderatorCheck.endReason || "Moderator ended the discussion.";
        break;
      }

      if (!nextSelection) {
        stopReason = "All other minds reported no new comment.";
      }
    }

    options.onProgress?.("Moderator final summary");
    const finalSummaryMessages = buildFinalSummaryMessages(
      config.topic,
      context,
      outputLanguage,
      rounds,
      moderatorReviews,
      stopReason ?? "Discussion ended.",
      promptTemplates,
    );
    finalSummary = await generateAndLog({
      phase: "final-summary",
      speaker: "Moderator",
      model: options.moderatorModel,
      messages: finalSummaryMessages,
      modelCalls,
      generateOptions: { maxOutputTokens: FINAL_SUMMARY_MAX_OUTPUT_TOKENS },
    });
    options.onSpeakerOutput?.({
      phase: "final-summary",
      phaseLabel: formatPhaseLabel("final-summary"),
      speaker: "Moderator",
      content: finalSummary,
    });

    await notifySessionUpdate(config, options, modelCalls, rounds, moderatorReviews, finalSummary, stopReason, undefined, dynamicState);
    return buildSessionResult(
      config,
      modelCalls,
      rounds,
      moderatorReviews,
      finalSummary,
      stopReason,
      undefined,
      dynamicState,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SessionRunError(
      message,
      buildSessionResult(
        config,
        modelCalls,
        rounds,
        moderatorReviews,
        finalSummary,
        stopReason,
        message,
        dynamicState,
      ),
    );
  }
}

function buildSessionResult(
  config: SessionConfig,
  modelCalls: ModelCallLog[],
  rounds: RoundResult[],
  moderatorReviews: ModeratorReview[],
  finalSummary?: string,
  stopReason?: string,
  error?: string,
  dynamicState?: DynamicSessionState,
): SessionResult {
  return {
    topic: config.topic,
    context: config.context,
    discussionMode: config.discussionMode ?? "simple",
    modelCalls,
    rounds,
    moderatorReviews,
    effectiveMaxTurns: dynamicState?.effectiveMaxTurns,
    dynamicTurns: dynamicState?.dynamicTurns ?? [],
    urgencyPolls: dynamicState?.urgencyPolls ?? [],
    dynamicModeratorChecks: dynamicState?.dynamicModeratorChecks ?? [],
    finalSummary,
    stopReason,
    error,
  };
}

async function notifySessionUpdate(
  config: SessionConfig,
  options: RunOptions,
  modelCalls: ModelCallLog[],
  rounds: RoundResult[],
  moderatorReviews: ModeratorReview[],
  finalSummary?: string,
  stopReason?: string,
  error?: string,
  dynamicState?: DynamicSessionState,
): Promise<void> {
  await options.onSessionUpdate?.(
    buildSessionResult(config, modelCalls, rounds, moderatorReviews, finalSummary, stopReason, error, dynamicState),
  );
}
function endDiscussion(review: ModeratorReview): string {
  return review.endReason || "Moderator ended the discussion.";
}

function countMindSpeeches(rounds: RoundResult[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const round of rounds) {
    for (const output of round.outputs) {
      counts.set(output.mindId, (counts.get(output.mindId) ?? 0) + 1);
    }
  }

  return counts;
}
function formatSelectionReason(
  selection: NextSpeakerSelection,
  minds: Array<Pick<LoadedMind, "id" | "name">>,
): string {
  if (selection.method === "urgency") {
    return "Your urgency was selected as " + selection.selectedUrgency + ".";
  }

  const inviter = minds.find((mind) => mind.id === selection.invitedByMindId);
  return "You were invited by " + (inviter?.name ?? selection.invitedByMindId ?? "the previous speaker") + ".";
}

function roundPhase(roundNumber: number): SpeakerOutputPhase {
  return `round-${roundNumber}` as SpeakerOutputPhase;
}

function moderatorReviewPhase(roundNumber: number): SpeakerOutputPhase {
  return `moderator-review-${roundNumber}` as SpeakerOutputPhase;
}

function dynamicTurnPhase(turnNumber: number): SpeakerOutputPhase {
  return ("dynamic-turn-" + turnNumber) as SpeakerOutputPhase;
}

function moderatorCheckPhase(turnNumber: number): SpeakerOutputPhase {
  return ("moderator-check-" + turnNumber) as SpeakerOutputPhase;
}

function urgencyPhase(turnNumber: number): ModelCallPhase {
  return ("urgency-after-turn-" + turnNumber) as ModelCallPhase;
}
