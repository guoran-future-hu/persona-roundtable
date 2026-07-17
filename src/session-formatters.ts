import type { PromptTemplateSet } from "./prompt-templates";
import type { DynamicModeratorCheck, ModeratorReview, SpeakerOutputPhase } from "./session-types";

export function formatDynamicModeratorCheckpoint(check: DynamicModeratorCheck): string {
  return [
    "Checkpoint summary: " + check.checkpointSummary,
    "",
    "Progress assessment: " + check.progressAssessment,
  ].join("\n");
}

export function formatDynamicModeratorCheck(check: DynamicModeratorCheck): string {
  if (check.action === "continue") return "Continue without summary.";
  if (check.action === "end_discussion") return "End discussion: " + check.endReason;
  return formatDynamicModeratorCheckpoint(check);
}

export function formatModeratorReview(review: ModeratorReview, _promptTemplates?: PromptTemplateSet): string {
  return [
    "Round summary: " + review.roundSummary,
    "Progress assessment: " + review.progressAssessment,
    "Decision: " + review.decision,
    "End reason: " + (review.endReason || "N/A"),
  ].join("\n\n");
}

export function formatPhaseLabel(phase: SpeakerOutputPhase): string {
  const roundMatch = phase.match(/^round-(\d+)$/);
  if (roundMatch?.[1]) return `Round ${roundMatch[1]}`;
  const moderatorMatch = phase.match(/^moderator-review-(\d+)$/);
  if (moderatorMatch?.[1]) return `Moderator Review: Round ${moderatorMatch[1]}`;
  const dynamicTurnMatch = phase.match(/^dynamic-turn-(\d+)$/);
  if (dynamicTurnMatch?.[1]) return "Turn " + dynamicTurnMatch[1];
  const moderatorCheckMatch = phase.match(/^moderator-check-(\d+)$/);
  if (moderatorCheckMatch?.[1]) return "Moderator Check: Turn " + moderatorCheckMatch[1];
  if (phase === "final-summary") return "Moderator Final Summary";
  return phase;
}
