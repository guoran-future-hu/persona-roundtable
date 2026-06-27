import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { MindConfig, SessionConfig } from "./config";
import type { ModelCallLog, RoundOutput, SessionResult } from "./orchestrator";
import { serializeContext } from "./orchestrator";
import { writeUtf8Text } from "./text-io";

export interface SavedSessionPaths {
  transcriptPath: string;
  devLogPath: string;
}

export async function saveTranscript(
  config: SessionConfig,
  result: SessionResult,
  outputDir = "sessions",
): Promise<SavedSessionPaths> {
  await mkdir(outputDir, { recursive: true });

  const createdAt = new Date();
  const baseName = `${createdAt.toISOString().replace(/[:.]/g, "-")}-${slugify(config.topic)}`;
  const transcriptPath = resolve(outputDir, `${baseName}.md`);
  const devLogPath = resolve(outputDir, `${baseName}.dev.md`);

  await writeUtf8Text(transcriptPath, renderTranscript(config, result, createdAt));
  await writeUtf8Text(devLogPath, renderDevLog(config, result, createdAt));

  return { transcriptPath, devLogPath };
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
    "## Working Language",
    "",
    config.workingLanguage ?? "Use the user's language unless the persona has a stronger reason to do otherwise.",
    "",
    "## Minds",
    "",
    formatMinds(config.minds),
    "",
    "## Round 1: Initial Views",
    "",
    formatOutputs(result.roundOne),
    "",
    "## Round 2: Responses and Updates",
    "",
    formatOutputs(result.roundTwo),
    "",
    "## Moderator Summary",
    "",
    result.moderatorSummary,
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
        testMode: config.testMode,
        workingLanguage: config.workingLanguage,
        globalMindsProvider: config.globalMindsProvider,
        moderatorProvider: config.moderatorProvider,
        compressionProvider: config.compressionProvider,
        minds: config.minds,
        disabledMinds: config.disabledMinds ?? [],
      },
      null,
      2,
    ),
    "```",
    "",
    ...formatRunError(result.error),
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

function formatMinds(minds: MindConfig[]): string {
  return minds.map((mind) => `- ${mind.name} (${mind.provider})`).join("\n");
}

function formatOutputs(outputs: RoundOutput[]): string {
  return outputs.map((output) => `### ${output.mindName}\n\n${output.content}`).join("\n\n");
}

function formatModelCall(call: ModelCallLog): string {
  return [
    `### ${call.phase}: ${call.speaker}`,
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
