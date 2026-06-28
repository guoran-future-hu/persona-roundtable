import type { SessionConfig } from "./config";
import type { ChatMessage, ChatModel } from "./models/types";
import type { LoadedMind } from "./personas";
import { defaultPromptTemplates, renderTemplate, type PromptTemplateSet } from "./prompt-templates";

const MAIN_RESPONSE_MAX_OUTPUT_TOKENS = 8192;
const MODERATOR_REVIEW_MAX_OUTPUT_TOKENS = 1400;
const FINAL_SUMMARY_MAX_OUTPUT_TOKENS = 2200;
const COMPRESSION_MAX_OUTPUT_TOKENS = 400;

export interface RoundOutput {
  mindId: string;
  mindName: string;
  content: string;
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
  modelCalls: ModelCallLog[];
  rounds: RoundResult[];
  moderatorReviews: ModeratorReview[];
  finalSummary?: string;
  stopReason?: string;
  error?: string;
}

export type SpeakerOutputPhase = `round-${number}` | `moderator-review-${number}` | "final-summary";

export interface ModelCallLog {
  phase: SpeakerOutputPhase | "compression";
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
): SessionResult {
  return {
    topic: config.topic,
    context: config.context,
    modelCalls,
    rounds,
    moderatorReviews,
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
