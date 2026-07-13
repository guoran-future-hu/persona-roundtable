import type { ChatMessage } from "./models/types";
import type { LoadedMind } from "./personas";
import { defaultPromptTemplates, renderTemplate, type PromptTemplateSet } from "./prompt-templates";
import type {
  DiscussionHistoryState,
  DynamicModeratorCheck,
  DynamicTurn,
  ModeratorReview,
  RoundOutput,
  RoundResult,
  UrgencyPoll,
} from "./session-types";

export function buildRoundOneMessages(
  topic: string,
  context: string,
  outputLanguage: string,
  mind: LoadedMind,
  minds: LoadedMind[],
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.roundOne, {
    mind_name: mind.name,
    active_minds: formatActiveMindsWithIds(minds),
    output_language: outputLanguage,
    persona: mind.persona,
    topic,
    context,
  });
}

export function buildFollowUpRoundMessages(
  topic: string,
  context: string,
  outputLanguage: string,
  roundNumber: number,
  mind: LoadedMind,
  previousRounds: RoundResult[],
  moderatorReviews: ModeratorReview[],
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.followUpRound, {
    mind_name: mind.name,
    active_minds: formatActiveMindsWithIds(previousRounds[0]?.outputs ?? []),
    round_number: String(roundNumber),
    output_language: outputLanguage,
    persona: mind.persona,
    topic,
    context,
    discussion_history: formatDiscussionHistory({ rounds: previousRounds, moderatorReviews }),
  });
}

export function buildModeratorMessages(
  topic: string,
  context: string,
  outputLanguage: string,
  rounds: RoundResult[],
  moderatorReviews: ModeratorReview[],
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.moderator, {
    output_language: outputLanguage,
    topic,
    context,
    discussion_history: formatDiscussionHistory({ rounds, moderatorReviews }),
  });
}

export function buildDynamicTurnMessages(
  topic: string,
  context: string,
  outputLanguage: string,
  mind: LoadedMind,
  minds: LoadedMind[],
  rounds: RoundResult[],
  moderatorReviews: ModeratorReview[],
  selectionReason: string,
  historyState: Pick<DiscussionHistoryState, "dynamicTurns" | "urgencyPolls" | "dynamicModeratorChecks">,
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.dynamicTurn, {
    mind_name: mind.name,
    active_minds: formatActiveMindsWithIds(minds),
    selection_reason: selectionReason,
    output_language: outputLanguage,
    persona: mind.persona,
    topic,
    context,
    discussion_history: formatDiscussionHistory({ rounds, moderatorReviews, ...historyState }),
  });
}

export function buildUrgencyMessages(
  topic: string,
  context: string,
  outputLanguage: string,
  mind: LoadedMind,
  minds: Array<Pick<LoadedMind, "id">>,
  rounds: RoundResult[],
  moderatorReviews: ModeratorReview[],
  historyState: Pick<DiscussionHistoryState, "dynamicTurns" | "urgencyPolls" | "dynamicModeratorChecks"> = {},
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.urgency, {
    mind_name: mind.name,
    active_minds: formatActiveMindsWithIds(minds),
    output_language: outputLanguage,
    persona: mind.persona,
    topic,
    context,
    discussion_history: formatDiscussionHistory({ rounds, moderatorReviews, ...historyState }),
  });
}

export function buildDynamicModeratorMessages(
  topic: string,
  context: string,
  outputLanguage: string,
  rounds: RoundResult[],
  turnsSinceCheckpoint: number,
  summaryTarget: number,
  moderatorReviews: ModeratorReview[],
  historyState: Pick<DiscussionHistoryState, "dynamicTurns" | "urgencyPolls" | "dynamicModeratorChecks">,
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.dynamicModerator, {
    summary_target: String(summaryTarget),
    output_language: outputLanguage,
    topic,
    context,
    discussion_history: formatDiscussionHistory({ rounds, moderatorReviews, ...historyState }),
  });
}

export function buildFinalSummaryMessages(
  topic: string,
  context: string,
  outputLanguage: string,
  rounds: RoundResult[],
  moderatorReviews: ModeratorReview[],
  stopReason: string,
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.finalSummary, {
    output_language: outputLanguage,
    topic,
    context,
    stop_reason: stopReason,
    discussion_history: formatDiscussionHistory({ rounds, moderatorReviews }),
  });
}

export function buildCompressionMessages(
  topic: string,
  outputLanguage: string,
  phaseLabel: string,
  speaker: string,
  output: string,
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.compression, {
    output_language: outputLanguage,
    topic,
    phase_label: phaseLabel,
    speaker_name: speaker,
    speaker_output: output,
  });
}

export function serializeContext(context: unknown): string {
  if (typeof context === "string") {
    return context;
  }

  return JSON.stringify(context, null, 2);
}

export function formatDiscussionHistory(state: DiscussionHistoryState): string {
  if (state.dynamicTurns === undefined) {
    return formatSimpleDiscussionHistory(state.rounds, state.moderatorReviews);
  }

  const parts: string[] = [];
  const openingRound = state.rounds[0];
  if (openingRound) {
    parts.push(...openingRound.outputs.map((output) => formatHistorySpeech(output.mindId, output.content, openingRound.roundNumber)));
  }

  const openingReview = state.moderatorReviews.find((review) => review.roundNumber === 1);
  if (openingReview) {
    parts.push(formatHistoryModeratorReview(openingReview));
  }

  for (const poll of state.urgencyPolls ?? []) {
    if (poll.afterTurnNumber === openingRound?.outputs.length) {
      parts.push(formatHistoryUrgencyPoll(poll));
    }
  }

  for (const turn of state.dynamicTurns) {
    parts.push(formatHistorySpeech(turn.mindId, turn.content, turn.turnNumber));
    if (turn.inviteMindId !== null) {
      parts.push(`<invitation from="${turn.mindId}" to="${turn.inviteMindId}" />`);
    }

    for (const poll of state.urgencyPolls ?? []) {
      if (poll.afterTurnNumber === turn.turnNumber) {
        parts.push(formatHistoryUrgencyPoll(poll));
      }
    }

    const check = state.dynamicModeratorChecks?.find((candidate) => candidate.afterTurnNumber === turn.turnNumber);
    if (check) {
      parts.push(formatHistoryModeratorCheck(check));
    }
  }

  return parts.length === 0 ? "No discussion history yet." : parts.join("\n\n");
}

function formatSimpleDiscussionHistory(rounds: RoundResult[], reviews: ModeratorReview[]): string {
  const parts: string[] = [];
  for (const round of rounds) {
    parts.push(...round.outputs.map((output) => formatHistorySpeech(output.mindId, output.content, round.roundNumber)));
    const review = reviews.find((candidate) => candidate.roundNumber === round.roundNumber);
    if (review) {
      parts.push(formatHistoryModeratorReview(review));
    }
  }

  return parts.length === 0 ? "No discussion history yet." : parts.join("\n\n");
}

function formatHistorySpeech(mindId: string, content: string, turnNumber: number): string {
  return `<speech turn="${turnNumber}" speaker="${mindId}">\n${content}\n</speech>`;
}

function formatHistoryUrgencyPoll(poll: UrgencyPoll): string {
  const selectedMind = poll.selectedMindId === undefined ? "" : ` selected_mind_id="${poll.selectedMindId}"`;
  return `<urgency-poll after_turn="${poll.afterTurnNumber}"${selectedMind}>\n${poll.signals
    .map((signal) => `${signal.mindId}: ${signal.urgency}`)
    .join("\n")}\n</urgency-poll>`;
}

function formatHistoryModeratorReview(review: ModeratorReview): string {
  return `<moderator-review round="${review.roundNumber}">\nSummary: ${review.roundSummary}\nDecision: ${review.decision}\n</moderator-review>`;
}

function formatHistoryModeratorCheck(check: DynamicModeratorCheck): string {
  const summary = check.action === "summarize" ? `\nSummary: ${check.checkpointSummary}` : "";
  return `<moderator-check after_turn="${check.afterTurnNumber}">\nDecision: ${check.action}${summary}\n</moderator-check>`;
}

export function formatPreviousRounds(rounds: RoundResult[]): string {
  if (rounds.length === 0) {
    return "No previous rounds.";
  }

  return rounds
    .map((round) => `<round number="${round.roundNumber}">\n${formatRoundOpinions(round.outputs)}\n</round>`)
    .join("\n\n");
}

function formatRoundOpinions(outputs: RoundOutput[]): string {
  return outputs
    .map((output) => `<opinion speaker="${output.mindName}">\n${output.content}\n</opinion>`)
    .join("\n\n");
}

export function formatModeratorProgressNotes(reviews: ModeratorReview[]): string {
  if (reviews.length === 0) {
    return "No previous moderator progress notes.";
  }

  return reviews
    .map(
      (review) =>
        `<progress-note round="${review.roundNumber}">\nSummary: ${review.roundSummary}\nAssessment: ${review.progressAssessment}\nDecision: ${review.decision}\n</progress-note>`,
    )
    .join("\n\n");
}

export function formatActiveMindsWithIds(minds: Array<Pick<LoadedMind, "id"> | Pick<RoundOutput, "mindId">>): string {
  return minds.map((mind) => ("mindId" in mind ? mind.mindId : mind.id)).join("\n");
}

export function formatDynamicCurrentTurn(
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
