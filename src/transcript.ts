import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { MindConfig, SessionConfig } from "./config";
import type { ModelCallLog, ModeratorReview, RoundOutput, RoundResult, SessionResult } from "./session-types";
import { formatDynamicModeratorCheck, formatModeratorReview } from "./session-formatters";
import { serializeContext } from "./discussion-prompts";
import { writeUtf8Text } from "./text-io";

export interface SavedSessionPaths {
  transcriptPath: string;
  devLogPath?: string;
  speakerCountLogPath?: string;
}

export interface SaveTranscriptOptions {
  debug?: boolean;
}

export function createTranscriptPath(config: SessionConfig, outputDir = "sessions", createdAt = new Date()): string {
  const baseName = createdAt.toISOString().replace(/[:.]/g, "-") + "-" + slugify(config.topic);
  return resolve(outputDir, baseName + ".md");
}

export async function saveUserTranscript(
  config: SessionConfig,
  result: SessionResult,
  transcriptPath: string,
  createdAt = new Date(),
): Promise<void> {
  await mkdir(dirname(transcriptPath), { recursive: true });
  await writeUtf8Text(transcriptPath, renderTranscript(config, result, createdAt));
}
export async function saveTranscript(
  config: SessionConfig,
  result: SessionResult,
  outputDir = "sessions",
  transcriptPathOverride?: string,
  options: SaveTranscriptOptions = {},
): Promise<SavedSessionPaths> {
  await mkdir(outputDir, { recursive: true });

  const createdAt = new Date();
  const baseName = `${createdAt.toISOString().replace(/[:.]/g, "-")}-${slugify(config.topic)}`;
  const transcriptPath = transcriptPathOverride ?? resolve(outputDir, `${baseName}.md`);
  const devLogPath = options.debug === true ? resolve(outputDir, `${baseName}.dev.md`) : undefined;
  const speakerCountLogPath = options.debug === true ? resolve(outputDir, `${baseName}.speaker-counts.tmp.json`) : undefined;

  await writeUtf8Text(transcriptPath, renderTranscript(config, result, createdAt));
  if (devLogPath !== undefined && speakerCountLogPath !== undefined) {
    await writeUtf8Text(devLogPath, renderDevLog(config, result, createdAt));
    await writeUtf8Text(speakerCountLogPath, JSON.stringify(renderSpeakerCounts(config, result, createdAt), null, 2));
  }

  return { transcriptPath, devLogPath, speakerCountLogPath };
}

function renderSpeakerCounts(config: SessionConfig, result: SessionResult, createdAt: Date): unknown {
  const counts = new Map<string, number>();
  for (const round of result.rounds) {
    for (const output of round.outputs) {
      counts.set(output.mindId, (counts.get(output.mindId) ?? 0) + 1);
    }
  }

  return {
    generatedAt: createdAt.toISOString(),
    counts: config.minds.map((mind) => ({ mindId: mind.id, mindName: mind.name, speeches: counts.get(mind.id) ?? 0 })),
  };
}
export function renderTranscript(config: SessionConfig, result: SessionResult, createdAt = new Date()): string {
  return [
    `# persona-roundtable Session: ${config.topic}`,
    "",
    `Generated: ${createdAt.toISOString()}`,
    "",
    "## Topic",
    "",
    config.topic,
    "",
    "## Context",
    "",
    "```text",
    serializeContext(result.context),
    "```",
    "",
    "## Output Language",
    "",
    config.outputLanguage ?? "Use the user's language unless the persona has a stronger reason to do otherwise.",
    "",
    "## Minds",
    "",
    formatMinds(config.minds),
    "",
    result.discussionMode === "dynamic"
      ? formatDynamicDiscussion(config, result)
      : formatRounds(result.rounds, result.moderatorReviews),
    ...formatFinalSummary(result.finalSummary),
    "## Stop Reason",
    "",
    result.stopReason ?? "Not available.",
    "",
    ...formatRunError(result.error),
  ].join("\n");
}

export function renderDevLog(config: SessionConfig, result: SessionResult, createdAt = new Date()): string {
  return [
    `# persona-roundtable Dev Log: ${config.topic}`,
    "",
    `Generated: ${createdAt.toISOString()}`,
    "",
    "## Session Config",
    "",
    "```json",
    JSON.stringify(
      {
        topic: config.topic,
        context: config.context,
        maxRounds: config.maxRounds,
        discussionMode: config.discussionMode ?? "simple",
        maxTurns: config.maxTurns,
        effectiveMaxTurns: result.effectiveMaxTurns,
        testMode: config.testMode,
        outputLanguage: config.outputLanguage,
        globalMindsProvider: config.globalMindsProvider,
        moderatorProvider: config.moderatorProvider,
        compressionEnabled: config.compressionEnabled !== false,
        compressionProvider: config.compressionProvider,
        urgencyProvider: config.urgencyProvider,
        minds: config.minds,
        disabledMinds: config.disabledMinds ?? [],
      },
      null,
      2,
    ),
    "```",
    "",
    ...formatRunError(result.error),
    ...formatDynamicState(result),
    "## Model Calls",
    "",
    result.modelCalls.map(formatModelCall).join("\n\n"),
    "",
  ].join("\n");
}

function formatRunError(error: string | undefined): string[] {
  if (error === undefined) {
    return [];
  }

  return ["## Run Error", "", "```text", error, "```", ""];
}

function formatFinalSummary(finalSummary: string | undefined): string[] {
  if (finalSummary === undefined) {
    return [];
  }

  return ["## Moderator Final Summary", "", finalSummary, ""];
}

function formatMinds(minds: MindConfig[]): string {
  return minds.map((mind) => `- ${mind.name} (${mind.provider})`).join("\n");
}

function formatOutputs(outputs: RoundOutput[]): string {
  return outputs.map((output) => `### ${output.mindName}\n\n${output.content}`).join("\n\n");
}

function formatDynamicDiscussion(config: SessionConfig, result: SessionResult): string {
  const openingRound = result.rounds[0];
  if (!openingRound) {
    return "";
  }

  const parts: string[] = [
    "## Round 1: Initial Views",
    "",
    formatOutputs(openingRound.outputs),
    "",
  ];
  const openingReview = result.moderatorReviews.find((review) => review.roundNumber === 1);
  if (openingReview) {
    parts.push("## Moderator Review: Round 1", "", formatModeratorReview(openingReview), "");
  }

  const initialPoll = result.urgencyPolls.find((poll) => poll.afterTurnNumber === config.minds.length);
  if (initialPoll) {
    parts.push(formatUrgencyPoll(initialPoll), "");
  }

  for (const turn of result.dynamicTurns) {
    const inviter = turn.invitedByMindId
      ? config.minds.find((mind) => mind.id === turn.invitedByMindId)
      : undefined;
    const invitedMind = turn.inviteMindId
      ? config.minds.find((mind) => mind.id === turn.inviteMindId)
      : undefined;
    const selection =
      turn.selectionMethod === "urgency"
        ? "urgency (" + turn.selectedUrgency + ")"
        : "invited by " + (inviter?.name ?? turn.invitedByMindId ?? "the previous speaker");

    parts.push(
      "## Turn " + turn.turnNumber + ": " + turn.mindName,
      "",
      "Selected by: " + selection,
      "",
      turn.content,
      "",
      "Invitation: " + (invitedMind ? invitedMind.name + " (" + invitedMind.id + ")" : "None"),
      "",
    );

    const poll = result.urgencyPolls.find((candidate) => candidate.afterTurnNumber === turn.turnNumber);
    if (poll) {
      parts.push(formatUrgencyPoll(poll), "");
    }

    const check = result.dynamicModeratorChecks.find((candidate) => candidate.afterTurnNumber === turn.turnNumber);
    if (check) {
      parts.push(
        "### Moderator Check",
        "",
        "Action: " + check.action,
        "",
        formatDynamicModeratorCheck(check),
        "",
      );
    }
  }

  return parts.join("\n");
}

function formatUrgencyPoll(poll: SessionResult["urgencyPolls"][number]): string {
  const selected = poll.selectedMindId
    ? poll.signals.find((signal) => signal.mindId === poll.selectedMindId)
    : undefined;
  return [
    "### Urgency Poll After Turn " + poll.afterTurnNumber,
    "",
    ...poll.signals.map((signal) => "- " + signal.mindName + ": " + signal.urgency),
    "",
    "Next speaker: " + (selected?.mindName ?? "None"),
  ].join("\n");
}

function formatDynamicState(result: SessionResult): string[] {
  if (result.discussionMode !== "dynamic") {
    return [];
  }

  return [
    "## Dynamic Scheduling State",
    "",
    "```json",
    JSON.stringify(
      {
        effectiveMaxTurns: result.effectiveMaxTurns,
        turns: result.dynamicTurns,
        urgencyPolls: result.urgencyPolls,
        moderatorChecks: result.dynamicModeratorChecks,
      },
      null,
      2,
    ),
    "```",
    "",
  ];
}

function formatRounds(rounds: RoundResult[], reviews: ModeratorReview[]): string {
  return rounds
    .flatMap((round) => {
      const review = reviews.find((candidate) => candidate.roundNumber === round.roundNumber);
      const roundTitle = round.roundNumber === 1 ? "Initial Views" : "Responses and Updates";

      return [
        `## Round ${round.roundNumber}: ${roundTitle}`,
        "",
        formatOutputs(round.outputs),
        "",
        review === undefined ? "" : formatModeratorSection(review, round.roundNumber === reviews.at(-1)?.roundNumber),
        "",
      ];
    })
    .join("\n");
}

function formatModeratorSection(review: ModeratorReview, isClosingReview: boolean): string {
  const heading = isClosingReview ? `## Moderator Closing Review (Round ${review.roundNumber})` : `## Moderator Review: Round ${review.roundNumber}`;

  return [heading, "", formatModeratorReview(review)].join("\n");
}

function formatModelCall(call: ModelCallLog): string {
  return [
    `### ${call.phase}: ${call.speaker}`,
    "",
    ...(call.attempt === undefined ? [] : [`Attempt: ${call.attempt}`]),
    ...(call.successful === false ? ["Validation: failed", call.validationError ?? "Unknown validation error"] : []),
    "",
    `Provider: ${call.provider}`,
    "",
    `Model: ${call.model}`,
    "",
    "#### Prompt Messages",
    "",
    ...call.messages.flatMap((message, index) => [
      `##### Message ${index + 1}: ${message.role}`,
      "",
      "```text",
      message.content,
      "```",
      "",
    ]),
    "#### Response",
    "",
    "```text",
    call.response,
    "```",
  ].join("\n");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "session";
}
