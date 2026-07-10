import type { SessionConfig } from "./config";
import type { ChatMessage, ChatModel } from "./models/types";
import type { LoadedMind } from "./personas";
import { defaultPromptTemplates, renderTemplate, type PromptTemplateSet } from "./prompt-templates";

const MAIN_RESPONSE_MAX_OUTPUT_TOKENS = 8192;
const MODERATOR_REVIEW_MAX_OUTPUT_TOKENS = 1400;
const URGENCY_MAX_OUTPUT_TOKENS = 128;
const FINAL_SUMMARY_MAX_OUTPUT_TOKENS = 2200;
const COMPRESSION_MAX_OUTPUT_TOKENS = 400;

export interface RoundOutput {
  mindId: string;
  mindName: string;
  content: string;
}

export type UrgencyLevel = "no_new_comment" | "minor_update" | "strong_need_to_respond";
export type DynamicSelectionMethod = "urgency" | "invitation";
export type DynamicModeratorAction = "continue" | "summarize" | "end_discussion";

export interface UrgencySignal {
  mindId: string;
  mindName: string;
  urgency: UrgencyLevel;
}

export interface UrgencyPoll {
  afterTurnNumber: number;
  signals: UrgencySignal[];
  selectedMindId?: string;
}

export interface DynamicTurn {
  turnNumber: number;
  mindId: string;
  mindName: string;
  content: string;
  selectionMethod: DynamicSelectionMethod;
  selectedUrgency?: UrgencyLevel;
  invitedByMindId?: string;
  inviteMindId: string | null;
}

export interface DynamicModeratorCheck {
  afterTurnNumber: number;
  turnsSinceCheckpoint: number;
  action: DynamicModeratorAction;
  checkpointSummary: string;
  progressNote: string;
  comparisonToPrevious: string;
  endReason: string;
}

export interface DynamicSpeakerResponse {
  content: string;
  inviteMindId: string | null;
}

export interface RoundResult {
  roundNumber: number;
  outputs: RoundOutput[];
}

export type ModeratorDecision = "continue" | "end_discussion";

export interface ModeratorReview {
  roundNumber: number;
  roundSummary: string;
  progressNote: string;
  comparisonToPrevious: string;
  decision: ModeratorDecision;
  endReason: string;
}

export interface SessionResult {
  topic: string;
  context: unknown;
  discussionMode: "simple" | "dynamic";
  modelCalls: ModelCallLog[];
  rounds: RoundResult[];
  moderatorReviews: ModeratorReview[];
  effectiveMaxTurns?: number;
  dynamicTurns: DynamicTurn[];
  urgencyPolls: UrgencyPoll[];
  dynamicModeratorChecks: DynamicModeratorCheck[];
  finalSummary?: string;
  stopReason?: string;
  error?: string;
}

export type SpeakerOutputPhase =
  | `round-${number}`
  | `moderator-review-${number}`
  | `dynamic-turn-${number}`
  | `moderator-check-${number}`
  | "final-summary";
export type ModelCallPhase = SpeakerOutputPhase | `urgency-after-turn-${number}` | "compression";

export interface ModelCallLog {
  phase: ModelCallPhase;
  speaker: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  response: string;
}

export interface CompressedOutput {
  phase: SpeakerOutputPhase;
  phaseLabel: string;
  speaker: string;
  content: string;
}

export interface SpeakerOutput {
  phase: SpeakerOutputPhase;
  phaseLabel: string;
  speaker: string;
  content: string;
}

export interface RunOptions {
  moderatorModel: ChatModel;
  compressionModel?: ChatModel;
  promptTemplates?: PromptTemplateSet;
  onProgress?: (message: string) => void;
  onCompressedOutput?: (output: CompressedOutput) => void;
  onSpeakerOutput?: (output: SpeakerOutput) => void;
}

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
  if ((config.discussionMode ?? "simple") === "dynamic") {
    return runDynamicRoundtableSession(config, minds, options);
  }

  return runSimpleRoundtableSession(config, minds, options);
}

async function runSimpleRoundtableSession(
  config: SessionConfig,
  minds: LoadedMind[],
  options: RunOptions,
): Promise<SessionResult> {
  const context = serializeContext(config.context);
  const workingLanguage = config.workingLanguage ?? "Use the user's language unless the persona has a stronger reason to do otherwise.";
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
            ? buildRoundOneMessages(config.topic, context, workingLanguage, mind, minds, promptTemplates)
            : buildFollowUpRoundMessages(config.topic, context, workingLanguage, roundNumber, mind, rounds.slice(0, -1), moderatorReviews, promptTemplates);
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
          workingLanguage,
          phase: roundPhase(roundNumber),
          speaker: mind.name,
          content,
          modelCalls,
          options,
          promptTemplates,
        });
      }

      options.onProgress?.(`Moderator review: Round ${roundNumber}`);
      const moderatorMessages = buildModeratorMessages(
        config.topic,
        context,
        workingLanguage,
        round,
        moderatorReviews,
        config.maxRounds,
        promptTemplates,
      );
      const rawModeratorReview = await generateAndLog({
        phase: moderatorReviewPhase(roundNumber),
        speaker: "Moderator",
        model: options.moderatorModel,
        messages: moderatorMessages,
        modelCalls,
        generateOptions: { maxOutputTokens: MODERATOR_REVIEW_MAX_OUTPUT_TOKENS },
      });
      const moderatorReview = parseModeratorReview(rawModeratorReview, roundNumber);
      moderatorReviews.push(moderatorReview);
      await handleSpeakerOutput({
        topic: config.topic,
        workingLanguage,
        phase: moderatorReviewPhase(roundNumber),
        speaker: "Moderator",
        content: formatModeratorReview(moderatorReview),
        modelCalls,
        options,
        promptTemplates,
      });

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
      workingLanguage,
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

    return buildSessionResult(config, modelCalls, rounds, moderatorReviews, finalSummary, stopReason);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SessionRunError(message, buildSessionResult(config, modelCalls, rounds, moderatorReviews, finalSummary, stopReason, message));
  }
}

interface NextSpeakerSelection {
  mind: LoadedMind;
  method: DynamicSelectionMethod;
  selectedUrgency?: UrgencyLevel;
  invitedByMindId?: string;
}

interface DynamicSessionState {
  effectiveMaxTurns: number;
  dynamicTurns: DynamicTurn[];
  urgencyPolls: UrgencyPoll[];
  dynamicModeratorChecks: DynamicModeratorCheck[];
}

async function runDynamicRoundtableSession(
  config: SessionConfig,
  minds: LoadedMind[],
  options: RunOptions,
): Promise<SessionResult> {
  const context = serializeContext(config.context);
  const workingLanguage = config.workingLanguage ?? "Use the user's language unless the persona has a stronger reason to do otherwise.";
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
      const messages = buildRoundOneMessages(config.topic, context, workingLanguage, mind, minds, promptTemplates);
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
        workingLanguage,
        phase: roundPhase(1),
        speaker: mind.name,
        content,
        modelCalls,
        options,
        promptTemplates,
      });
    }

    options.onProgress?.("Moderator review: Round 1");
    const openingModeratorMessages = buildModeratorMessages(
      config.topic,
      context,
      workingLanguage,
      openingRound,
      moderatorReviews,
      config.maxRounds,
      promptTemplates,
    );
    const rawOpeningReview = await generateAndLog({
      phase: moderatorReviewPhase(1),
      speaker: "Moderator",
      model: options.moderatorModel,
      messages: openingModeratorMessages,
      modelCalls,
      generateOptions: { maxOutputTokens: MODERATOR_REVIEW_MAX_OUTPUT_TOKENS },
    });
    const openingReview = parseModeratorReview(rawOpeningReview, 1);
    moderatorReviews.push(openingReview);
    await handleSpeakerOutput({
      topic: config.topic,
      workingLanguage,
      phase: moderatorReviewPhase(1),
      speaker: "Moderator",
      content: formatModeratorReview(openingReview),
      modelCalls,
      options,
      promptTemplates,
    });

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
        workingLanguage,
        minds,
        rounds,
        moderatorReviews,
        modelCalls,
        urgencyPolls: dynamicState.urgencyPolls,
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
        workingLanguage,
        selection.mind,
        minds,
        rounds,
        moderatorReviews,
        selectionReason,
        promptTemplates,
      );
      const rawResponse = await generateAndLog({
        phase: dynamicTurnPhase(turnNumber),
        speaker: selection.mind.name,
        model: selection.mind.model,
        messages,
        modelCalls,
        generateOptions: { maxOutputTokens: MAIN_RESPONSE_MAX_OUTPUT_TOKENS },
      });
      const response = parseDynamicSpeakerResponse(rawResponse, turnNumber, selection.mind, minds);
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
        workingLanguage,
        phase: dynamicTurnPhase(turnNumber),
        speaker: selection.mind.name,
        content: response.content,
        modelCalls,
        options,
        promptTemplates,
      });

      turnsSinceCheckpoint += 1;
      options.onProgress?.("Moderator check: Turn " + turnNumber);
      const moderatorMessages = buildDynamicModeratorMessages(
        config.topic,
        context,
        workingLanguage,
        dynamicState.dynamicTurns.slice(-turnsSinceCheckpoint),
        turnsSinceCheckpoint,
        minds.length,
        moderatorReviews,
        minds,
        promptTemplates,
      );
      const rawModeratorCheck = await generateAndLog({
        phase: moderatorCheckPhase(turnNumber),
        speaker: "Moderator",
        model: options.moderatorModel,
        messages: moderatorMessages,
        modelCalls,
        generateOptions: { maxOutputTokens: MODERATOR_REVIEW_MAX_OUTPUT_TOKENS },
      });
      const moderatorCheck = parseDynamicModeratorCheck(rawModeratorCheck, turnNumber, turnsSinceCheckpoint);
      dynamicState.dynamicModeratorChecks.push(moderatorCheck);

      if (moderatorCheck.action === "summarize") {
        const checkpointReview: ModeratorReview = {
          roundNumber: turnNumber,
          roundSummary: moderatorCheck.checkpointSummary,
          progressNote: moderatorCheck.progressNote,
          comparisonToPrevious: moderatorCheck.comparisonToPrevious,
          decision: "continue",
          endReason: "",
        };
        moderatorReviews.push(checkpointReview);
        await handleSpeakerOutput({
          topic: config.topic,
          workingLanguage,
          phase: moderatorCheckPhase(turnNumber),
          speaker: "Moderator",
          content: formatDynamicModeratorCheckpoint(moderatorCheck),
          modelCalls,
          options,
          promptTemplates,
        });
        turnsSinceCheckpoint = 0;
      }

      if (moderatorCheck.action === "end_discussion") {
        stopReason = moderatorCheck.endReason || "Moderator ended the discussion.";
        break;
      }

      if (turnNumber >= dynamicState.effectiveMaxTurns) {
        stopReason = "Reached maxTurns (" + dynamicState.effectiveMaxTurns + ").";
        break;
      }

      if (response.inviteMindId !== null) {
        const invitedMind = minds.find((mind) => mind.id === response.inviteMindId)!;
        nextSelection = {
          mind: invitedMind,
          method: "invitation",
          invitedByMindId: selection.mind.id,
        };
        continue;
      }

      nextSelection = await selectNextByUrgency({
        afterTurnNumber: turnNumber,
        previousMindId: selection.mind.id,
        config,
        context,
        workingLanguage,
        minds,
        rounds,
        moderatorReviews,
        modelCalls,
        urgencyPolls: dynamicState.urgencyPolls,
        promptTemplates,
        options,
      });

      if (!nextSelection) {
        stopReason = "All other minds reported no new comment.";
      }
    }

    options.onProgress?.("Moderator final summary");
    const finalSummaryMessages = buildFinalSummaryMessages(
      config.topic,
      context,
      workingLanguage,
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

async function selectNextByUrgency({
  afterTurnNumber,
  previousMindId,
  config,
  context,
  workingLanguage,
  minds,
  rounds,
  moderatorReviews,
  modelCalls,
  urgencyPolls,
  promptTemplates,
  options,
}: {
  afterTurnNumber: number;
  previousMindId: string;
  config: SessionConfig;
  context: string;
  workingLanguage: string;
  minds: LoadedMind[];
  rounds: RoundResult[];
  moderatorReviews: ModeratorReview[];
  modelCalls: ModelCallLog[];
  urgencyPolls: UrgencyPoll[];
  promptTemplates: PromptTemplateSet;
  options: RunOptions;
}): Promise<NextSpeakerSelection | undefined> {
  const eligibleMinds = minds.filter((mind) => mind.id !== previousMindId);
  options.onProgress?.("Urgency poll after turn " + afterTurnNumber);

  const signalResults = await Promise.allSettled(
    eligibleMinds.map(async (mind): Promise<UrgencySignal> => {
      const messages = buildUrgencyMessages(
        config.topic,
        context,
        workingLanguage,
        mind,
        rounds,
        moderatorReviews,
        promptTemplates,
      );
      const raw = await generateAndLog({
        phase: urgencyPhase(afterTurnNumber),
        speaker: mind.name,
        model: mind.model,
        messages,
        modelCalls,
        generateOptions: { maxOutputTokens: URGENCY_MAX_OUTPUT_TOKENS, thinkingEnabled: false },
      });

      return {
        mindId: mind.id,
        mindName: mind.name,
        urgency: parseUrgencyResponse(raw, afterTurnNumber, mind),
      };
    }),
  );
  const signals = signalResults.map((result) => {
    if (result.status === "rejected") {
      throw result.reason;
    }

    return result.value;
  });

  const selectedSignal =
    signals.find((signal) => signal.urgency === "strong_need_to_respond") ??
    signals.find((signal) => signal.urgency === "minor_update");
  const poll: UrgencyPoll = {
    afterTurnNumber,
    signals,
    selectedMindId: selectedSignal?.mindId,
  };
  urgencyPolls.push(poll);

  if (!selectedSignal) {
    return undefined;
  }

  return {
    mind: minds.find((mind) => mind.id === selectedSignal.mindId)!,
    method: "urgency",
    selectedUrgency: selectedSignal.urgency,
  };
}

export function buildRoundOneMessages(
  topic: string,
  context: string,
  workingLanguage: string,
  mind: LoadedMind,
  minds: LoadedMind[],
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  const otherMindNames = minds
    .filter((candidate) => candidate.id !== mind.id)
    .map((candidate) => candidate.name)
    .join(", ");
  const activeMindNames = formatActiveMindNames(minds);

  return renderTemplate(promptTemplates.roundOne, {
    mind_name: mind.name,
    active_mind_names: activeMindNames,
    other_mind_names: otherMindNames,
    working_language: workingLanguage,
    persona: mind.persona,
    topic,
    context,
  });
}

export function buildFollowUpRoundMessages(
  topic: string,
  context: string,
  workingLanguage: string,
  roundNumber: number,
  mind: LoadedMind,
  previousRounds: RoundResult[],
  moderatorReviews: ModeratorReview[],
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.followUpRound, {
    mind_name: mind.name,
    active_mind_names: formatActiveMindNames(previousRounds[0]?.outputs ?? []),
    round_number: String(roundNumber),
    working_language: workingLanguage,
    persona: mind.persona,
    topic,
    context,
    previous_rounds: formatPreviousRounds(previousRounds),
    moderator_progress_notes: formatModeratorProgressNotes(moderatorReviews),
  });
}

export function buildModeratorMessages(
  topic: string,
  context: string,
  workingLanguage: string,
  currentRound: RoundResult,
  previousReviews: ModeratorReview[],
  maxRounds: number,
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.moderator, {
    working_language: workingLanguage,
    topic,
    context,
    round_number: String(currentRound.roundNumber),
    max_rounds: String(maxRounds),
    previous_progress_notes: formatModeratorProgressNotes(previousReviews),
    current_round_opinions: formatRoundOpinions(currentRound.outputs),
  });
}

export function buildDynamicTurnMessages(
  topic: string,
  context: string,
  workingLanguage: string,
  mind: LoadedMind,
  minds: LoadedMind[],
  rounds: RoundResult[],
  moderatorReviews: ModeratorReview[],
  selectionReason: string,
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.dynamicTurn, {
    mind_name: mind.name,
    active_minds: formatActiveMindsWithIds(minds),
    selection_reason: selectionReason,
    working_language: workingLanguage,
    persona: mind.persona,
    topic,
    context,
    discussion_history: formatPreviousRounds(rounds),
    moderator_progress_notes: formatModeratorProgressNotes(moderatorReviews),
  });
}

export function buildUrgencyMessages(
  topic: string,
  context: string,
  workingLanguage: string,
  mind: LoadedMind,
  rounds: RoundResult[],
  moderatorReviews: ModeratorReview[],
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.urgency, {
    mind_name: mind.name,
    working_language: workingLanguage,
    persona: mind.persona,
    topic,
    context,
    discussion_history: formatPreviousRounds(rounds),
    moderator_progress_notes: formatModeratorProgressNotes(moderatorReviews),
  });
}

export function buildDynamicModeratorMessages(
  topic: string,
  context: string,
  workingLanguage: string,
  recentTurns: DynamicTurn[],
  turnsSinceCheckpoint: number,
  summaryTarget: number,
  moderatorReviews: ModeratorReview[],
  minds: LoadedMind[],
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.dynamicModerator, {
    summary_target: String(summaryTarget),
    working_language: workingLanguage,
    topic,
    context,
    turns_since_checkpoint: String(turnsSinceCheckpoint),
    moderator_progress_notes: formatModeratorProgressNotes(moderatorReviews),
    recent_turns: recentTurns.map((recentTurn) => formatDynamicCurrentTurn(recentTurn, minds)).join("\n\n"),
  });
}

export function parseDynamicSpeakerResponse(
  raw: string,
  turnNumber: number,
  currentMind: Pick<LoadedMind, "id" | "name">,
  minds: Array<Pick<LoadedMind, "id" | "name">>,
): DynamicSpeakerResponse {
  const parsed = parseJsonObject(raw, "Dynamic response for turn " + turnNumber);
  const content = expectNonEmptyString(parsed.content, "Dynamic response for turn " + turnNumber + " field 'content'");
  const inviteMindId = parsed.inviteMindId;

  if (inviteMindId !== null && typeof inviteMindId !== "string") {
    throw new Error("Dynamic response for turn " + turnNumber + " field 'inviteMindId' must be a mind ID or null");
  }

  if (inviteMindId === currentMind.id) {
    throw new Error("Dynamic response for turn " + turnNumber + " cannot invite the current mind");
  }

  if (typeof inviteMindId === "string" && !minds.some((mind) => mind.id === inviteMindId)) {
    throw new Error("Dynamic response for turn " + turnNumber + " invited unknown mind ID '" + inviteMindId + "'");
  }

  return { content, inviteMindId };
}

export function parseUrgencyResponse(
  raw: string,
  afterTurnNumber: number,
  mind: Pick<LoadedMind, "name">,
): UrgencyLevel {
  const parsed = parseJsonObject(raw, "Urgency response from " + mind.name + " after turn " + afterTurnNumber);

  if (
    parsed.urgency !== "no_new_comment" &&
    parsed.urgency !== "minor_update" &&
    parsed.urgency !== "strong_need_to_respond"
  ) {
    throw new Error("Urgency response from " + mind.name + " after turn " + afterTurnNumber + " has invalid urgency");
  }

  return parsed.urgency;
}

export function parseDynamicModeratorCheck(
  raw: string,
  afterTurnNumber: number,
  turnsSinceCheckpoint: number,
): DynamicModeratorCheck {
  const label = "Moderator check after turn " + afterTurnNumber;
  const parsed = parseJsonObject(raw, label);
  const action = parsed.action;

  if (action !== "continue" && action !== "summarize" && action !== "end_discussion") {
    throw new Error(label + " has invalid action");
  }

  const checkpointSummary = expectString(parsed.checkpointSummary, "checkpointSummary", afterTurnNumber);
  const progressNote = expectString(parsed.progressNote, "progressNote", afterTurnNumber);
  const comparisonToPrevious = expectString(parsed.comparisonToPrevious, "comparisonToPrevious", afterTurnNumber);
  const endReason = expectString(parsed.endReason, "endReason", afterTurnNumber);
  const hasSummaryFields =
    checkpointSummary.trim() !== "" || progressNote.trim() !== "" || comparisonToPrevious.trim() !== "";

  if (action === "continue" && (hasSummaryFields || endReason.trim() !== "")) {
    throw new Error(label + " action 'continue' requires empty summary and end fields");
  }

  if (
    action === "summarize" &&
    (checkpointSummary.trim() === "" ||
      progressNote.trim() === "" ||
      comparisonToPrevious.trim() === "" ||
      endReason.trim() !== "")
  ) {
    throw new Error(label + " action 'summarize' requires summary fields and an empty endReason");
  }

  if (action === "end_discussion" && (hasSummaryFields || endReason.trim() === "")) {
    throw new Error(label + " action 'end_discussion' requires only a non-empty endReason");
  }

  return {
    afterTurnNumber,
    turnsSinceCheckpoint,
    action,
    checkpointSummary,
    progressNote,
    comparisonToPrevious,
    endReason,
  };
}

export function formatDynamicModeratorCheckpoint(check: DynamicModeratorCheck): string {
  return [
    "Checkpoint summary: " + check.checkpointSummary,
    "",
    "Progress note: " + check.progressNote,
    "",
    "Comparison to previous: " + check.comparisonToPrevious,
  ].join("\n");
}

export function formatDynamicModeratorCheck(check: DynamicModeratorCheck): string {
  if (check.action === "continue") {
    return "Continue without summary.";
  }

  if (check.action === "end_discussion") {
    return "End discussion: " + check.endReason;
  }

  return formatDynamicModeratorCheckpoint(check);
}

export function buildFinalSummaryMessages(
  topic: string,
  context: string,
  workingLanguage: string,
  rounds: RoundResult[],
  moderatorReviews: ModeratorReview[],
  stopReason: string,
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.finalSummary, {
    working_language: workingLanguage,
    topic,
    context,
    stop_reason: stopReason,
    moderator_progress_notes: formatModeratorProgressNotes(moderatorReviews),
    previous_rounds: formatPreviousRounds(rounds),
  });
}

export function buildCompressionMessages(
  topic: string,
  workingLanguage: string,
  phaseLabel: string,
  speaker: string,
  output: string,
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.compression, {
    working_language: workingLanguage,
    topic,
    phase_label: phaseLabel,
    speaker_name: speaker,
    speaker_output: output,
  });
}

export function parseModeratorReview(raw: string, roundNumber: number): ModeratorReview {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw.trim()) as unknown;
  } catch {
    throw new Error(`Moderator review for round ${roundNumber} was not valid JSON`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Moderator review for round ${roundNumber} must be a JSON object`);
  }

  const parsedDecision = expectModeratorDecision(parsed.decision, roundNumber);
  const decision = normalizeModeratorDecision(parsedDecision, roundNumber);

  return {
    roundNumber,
    roundSummary: expectString(parsed.roundSummary, "roundSummary", roundNumber),
    progressNote: expectString(parsed.progressNote, "progressNote", roundNumber),
    comparisonToPrevious: expectString(parsed.comparisonToPrevious, "comparisonToPrevious", roundNumber),
    decision,
    endReason:
      parsedDecision !== decision
        ? ""
        : expectString(parsed.endReason, "endReason", roundNumber),
  };
}

export function formatModeratorReview(review: ModeratorReview): string {
  return [
    `Round summary: ${review.roundSummary}`,
    "",
    `Progress note: ${review.progressNote}`,
    "",
    `Comparison to previous: ${review.comparisonToPrevious}`,
    "",
    `Decision: ${review.decision}`,
    "",
    `End reason: ${review.endReason || "N/A"}`,
  ].join("\n");
}

export function serializeContext(context: unknown): string {
  if (typeof context === "string") {
    return context;
  }

  return JSON.stringify(context, null, 2);
}

async function handleSpeakerOutput({
  topic,
  workingLanguage,
  phase,
  speaker,
  content,
  modelCalls,
  options,
  promptTemplates,
}: {
  topic: string;
  workingLanguage: string;
  phase: SpeakerOutputPhase;
  speaker: string;
  content: string;
  modelCalls: ModelCallLog[];
  options: RunOptions;
  promptTemplates: PromptTemplateSet;
}): Promise<void> {
  const phaseLabel = formatPhaseLabel(phase);

  if (!options.compressionModel) {
    options.onSpeakerOutput?.({ phase, phaseLabel, speaker, content });
    return;
  }

  const messages = buildCompressionMessages(topic, workingLanguage, phaseLabel, speaker, content, promptTemplates);
  try {
    const compressed = await generateAndLog({
      phase: "compression",
      speaker,
      model: options.compressionModel,
      messages,
      modelCalls,
      generateOptions: { maxOutputTokens: COMPRESSION_MAX_OUTPUT_TOKENS, thinkingEnabled: false },
    });
    options.onCompressedOutput?.({ phase, phaseLabel, speaker, content: compressed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.onCompressedOutput?.({ phase, phaseLabel, speaker, content: `[compression failed: ${message}]` });
  }
}

async function generateAndLog({
  phase,
  speaker,
  model,
  messages,
  modelCalls,
  generateOptions,
}: {
  phase: ModelCallLog["phase"];
  speaker: string;
  model: ChatModel;
  messages: ChatMessage[];
  modelCalls: ModelCallLog[];
  generateOptions?: Parameters<ChatModel["generate"]>[1];
}): Promise<string> {
  try {
    const response = await model.generate(messages, generateOptions);
    modelCalls.push({
      phase,
      speaker,
      provider: model.provider,
      model: model.model,
      messages,
      response,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    modelCalls.push({
      phase,
      speaker,
      provider: model.provider,
      model: model.model,
      messages,
      response: `[ERROR] ${message}`,
    });
    throw error;
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

function endDiscussion(review: ModeratorReview): string {
  return review.endReason || "Moderator ended the discussion.";
}

function formatPreviousRounds(rounds: RoundResult[]): string {
  if (rounds.length === 0) {
    return "No previous rounds.";
  }

  return rounds
    .map((round) => `<round number="${round.roundNumber}">\n${formatRoundOpinions(round.outputs)}\n</round>`)
    .join("\n\n");
}

function formatRoundOpinions(outputs: RoundOutput[]): string {
  return outputs
    .map((output) => `<opinion speaker="${output.mindName}">\n${output.mindName} said:\n${output.content}\n</opinion>`)
    .join("\n\n");
}

function formatModeratorProgressNotes(reviews: ModeratorReview[]): string {
  if (reviews.length === 0) {
    return "No previous moderator progress notes.";
  }

  return reviews
    .map(
      (review) =>
        `<progress-note round="${review.roundNumber}">\nSummary: ${review.roundSummary}\nProgress: ${review.progressNote}\nComparison: ${review.comparisonToPrevious}\nDecision: ${review.decision}\n</progress-note>`,
    )
    .join("\n\n");
}

function formatActiveMindsWithIds(minds: Array<Pick<LoadedMind, "id" | "name">>): string {
  return minds.map((mind) => mind.id + ": " + mind.name).join("\n");
}

function formatDynamicCurrentTurn(
  turn: DynamicTurn,
  minds: Array<Pick<LoadedMind, "id" | "name">>,
): string {
  const invitedMind = turn.inviteMindId === null ? undefined : minds.find((mind) => mind.id === turn.inviteMindId);
  return [
    "Turn: " + turn.turnNumber,
    "Speaker: " + turn.mindName + " (" + turn.mindId + ")",
    "Invitation: " + (invitedMind ? invitedMind.name + " (" + invitedMind.id + ")" : "None"),
    "",
    turn.content,
  ].join("\n");
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

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw.trim()) as unknown;
  } catch {
    throw new Error(label + " was not valid JSON");
  }

  if (!isRecord(parsed)) {
    throw new Error(label + " must be a JSON object");
  }

  return parsed;
}

function expectNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(label + " must be a non-empty string");
  }

  return value;
}
function formatActiveMindNames(minds: Array<Pick<LoadedMind, "name"> | Pick<RoundOutput, "mindName">>): string {
  return minds.map((mind) => ("mindName" in mind ? mind.mindName : mind.name)).join(", ");
}

function formatPhaseLabel(phase: SpeakerOutputPhase): string {
  const roundMatch = phase.match(/^round-(\d+)$/);
  if (roundMatch?.[1]) {
    return `Round ${roundMatch[1]}`;
  }

  const moderatorMatch = phase.match(/^moderator-review-(\d+)$/);
  if (moderatorMatch?.[1]) {
    return `Moderator Review: Round ${moderatorMatch[1]}`;
  }

  const dynamicTurnMatch = phase.match(/^dynamic-turn-(d+)$/);
  if (dynamicTurnMatch?.[1]) {
    return "Turn " + dynamicTurnMatch[1];
  }

  const moderatorCheckMatch = phase.match(/^moderator-check-(d+)$/);
  if (moderatorCheckMatch?.[1]) {
    return "Moderator Check: Turn " + moderatorCheckMatch[1];
  }

  if (phase === "final-summary") {
    return "Moderator Final Summary";
  }

  return phase;
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
function expectModeratorDecision(value: unknown, roundNumber: number): ModeratorDecision {
  if (value === "continue" || value === "end_discussion") {
    return value;
  }

  throw new Error(`Moderator review for round ${roundNumber} has invalid decision`);
}

function normalizeModeratorDecision(decision: ModeratorDecision, roundNumber: number): ModeratorDecision {
  return roundNumber === 1 && decision === "end_discussion" ? "continue" : decision;
}

function expectString(value: unknown, field: string, roundNumber: number): string {
  if (typeof value !== "string") {
    throw new Error(`Moderator review for round ${roundNumber} must include string field '${field}'`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
