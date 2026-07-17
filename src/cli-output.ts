import type { CompressedOutput, SpeakerOutput, SpeakerOutputPhase } from "./session-types";

export function formatLiveOutput(output: CompressedOutput | SpeakerOutput): string {
  return [formatLiveOutputHeader(output.phase, output.speaker), indent(output.content)].join("\n");
}

export function formatLiveProgress(message: string): string | undefined {
  if (!message.startsWith("Urgency after turn ") && !message.endsWith(" as follow-up speaker")) return undefined;
  return message;
}

function formatLiveOutputHeader(phase: SpeakerOutputPhase, speaker: string): string {
  const roundMatch = phase.match(/^round-(\d+)$/);
  if (roundMatch?.[1]) return `Round ${roundMatch[1]} · ${speaker}`;

  const moderatorReviewMatch = phase.match(/^moderator-review-(\d+)$/);
  if (moderatorReviewMatch?.[1]) return `Moderator review · Round ${moderatorReviewMatch[1]} · ${speaker}`;

  const dynamicTurnMatch = phase.match(/^dynamic-turn-(\d+)$/);
  if (dynamicTurnMatch?.[1]) return `Turn ${dynamicTurnMatch[1]} · ${speaker}`;

  const moderatorCheckMatch = phase.match(/^moderator-check-(\d+)$/);
  if (moderatorCheckMatch?.[1]) return `Checkpoint · Turn ${moderatorCheckMatch[1]} · ${speaker}`;

  if (phase === "final-summary") return `Final summary · ${speaker}`;
  return `${phase} · ${speaker}`;
}

function indent(content: string): string {
  return content
    .trim()
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join("\n");
}