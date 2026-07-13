import type { LoadedMind } from "./personas";
import type { StructuredOutputSpec } from "./models/types";
import type {
  DynamicModeratorCheck,
  DynamicSpeakerResponse,
  ModeratorDecision,
  ModeratorReview,
  UrgencyLevel,
} from "./session-types";

export const urgencySpec: StructuredOutputSpec = {
  name: "urgency",
  schema: {
    type: "object",
    properties: { urgency: { type: "string", enum: ["no_new_comment", "minor_update", "strong_need_to_respond"] } },
    required: ["urgency"],
    additionalProperties: false,
  },
};

export const dynamicModeratorCheckSpec: StructuredOutputSpec = {
  name: "dynamic_moderator_check",
  schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["continue", "summarize", "end_discussion"] },
      checkpointSummary: { type: "string" },
      progressAssessment: { type: "string" },
      endReason: { type: "string" },
    },
    required: ["action", "checkpointSummary", "progressAssessment", "endReason"],
    additionalProperties: false,
  },
};

export function moderatorReviewSpec(roundNumber: number): StructuredOutputSpec {
  return {
    name: "moderator_review",
    schema: {
      type: "object",
      properties: {
        roundSummary: { type: "string" },
        progressAssessment: { type: "string" },
        decision: { type: "string", enum: roundNumber === 1 ? ["continue"] : ["continue", "end_discussion"] },
        endReason: { type: "string" },
      },
      required: ["roundSummary", "progressAssessment", "decision", "endReason"],
      additionalProperties: false,
    },
  };
}

export function dynamicSpeakerResponseSpec(currentMindId: string, minds: Array<Pick<LoadedMind, "id">>): StructuredOutputSpec {
  return {
    name: "dynamic_speaker_response",
    schema: {
      type: "object",
      properties: {
        content: { type: "string" },
        inviteMindId: { anyOf: [{ type: "string", enum: minds.filter((mind) => mind.id !== currentMindId).map((mind) => mind.id) }, { type: "null" }] },
      },
      required: ["content", "inviteMindId"],
      additionalProperties: false,
    },
  };
}

export function parseDynamicSpeakerResponse(
  raw: string,
  turnNumber: number,
  currentMind: Pick<LoadedMind, "id" | "name">,
  minds: Array<Pick<LoadedMind, "id" | "name">>,
): DynamicSpeakerResponse {
  const label = "Dynamic response for turn " + turnNumber;
  let parsed = parseJsonObject(raw, label);
  const finalJsonStart = findLastJsonObjectStart(raw);
  const precedingText = finalJsonStart === undefined ? "" : raw.slice(0, finalJsonStart).trim();
  if (parsed.content === undefined && precedingText !== "") {
    parsed = { ...parsed, content: precedingText };
  }
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

export function parseUrgencyResponse(raw: string, afterTurnNumber: number, mind: Pick<LoadedMind, "name">): UrgencyLevel {
  const parsed = parseJsonObject(raw, "Urgency response from " + mind.name + " after turn " + afterTurnNumber);
  if (parsed.urgency !== "no_new_comment" && parsed.urgency !== "minor_update" && parsed.urgency !== "strong_need_to_respond") {
    throw new Error("Urgency response from " + mind.name + " after turn " + afterTurnNumber + " has invalid urgency");
  }
  return parsed.urgency;
}

export function parseDynamicModeratorCheck(raw: string, afterTurnNumber: number, turnsSinceCheckpoint: number): DynamicModeratorCheck {
  const label = "Moderator check after turn " + afterTurnNumber;
  const parsed = parseJsonObject(raw, label);
  const action = parsed.action;
  if (action !== "continue" && action !== "summarize" && action !== "end_discussion") {
    throw new Error(label + " has invalid action");
  }

  const checkpointSummary = optionalDynamicModeratorString(parsed.checkpointSummary, "checkpointSummary", label);
  const progressAssessment = optionalDynamicModeratorString(parsed.progressAssessment, "progressAssessment", label);
  const endReason = optionalDynamicModeratorString(parsed.endReason, "endReason", label);
  const hasSummaryFields = checkpointSummary.trim() !== "" || progressAssessment.trim() !== "";
  if (action === "continue" && (hasSummaryFields || endReason.trim() !== "")) {
    throw new Error(label + " action 'continue' requires empty summary and end fields");
  }
  if (action === "summarize" && (checkpointSummary.trim() === "" || progressAssessment.trim() === "" || endReason.trim() !== "")) {
    throw new Error(label + " action 'summarize' requires summary fields and an empty endReason");
  }
  if (action === "end_discussion" && (hasSummaryFields || endReason.trim() === "")) {
    throw new Error(label + " action 'end_discussion' requires only a non-empty endReason");
  }

  return { afterTurnNumber, turnsSinceCheckpoint, action, checkpointSummary, progressAssessment, endReason };
}

export function parseModeratorReview(raw: string, roundNumber: number): ModeratorReview {
  const parsed = parseJsonObject(raw, "Moderator review for round " + roundNumber);
  const parsedDecision = expectModeratorDecision(parsed.decision, roundNumber);
  const decision = normalizeModeratorDecision(parsedDecision, roundNumber);
  return {
    roundNumber,
    roundSummary: expectString(parsed.roundSummary, "roundSummary", roundNumber),
    progressAssessment: expectString(parsed.progressAssessment, "progressAssessment", roundNumber),
    decision,
    endReason: parsedDecision !== decision ? "" : expectString(parsed.endReason, "endReason", roundNumber),
  };
}

export function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const candidates = [raw.trim(), extractLastJsonObject(raw)].filter((candidate): candidate is string => candidate !== undefined);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Try the embedded JSON object, if any.
    }
  }
  throw new Error(label + " was not valid JSON");
}

function extractLastJsonObject(raw: string): string | undefined {
  const start = findLastJsonObjectStart(raw);
  if (start === undefined) {
    return undefined;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, index + 1);
    }
  }
  return undefined;
}

function findLastJsonObjectStart(raw: string): number | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start: number | undefined;
  let lastCompleteStart: number | undefined;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0 && start !== undefined) lastCompleteStart = start;
    }
  }
  return lastCompleteStart;
}

function optionalDynamicModeratorString(value: unknown, field: string, label: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(label + " field \"" + field + "\" must be a string when provided");
  return value;
}

function expectNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(label + " must be a non-empty string");
  return value;
}

function expectModeratorDecision(value: unknown, roundNumber: number): ModeratorDecision {
  if (value === "continue" || value === "end_discussion") return value;
  throw new Error(`Moderator review for round ${roundNumber} has invalid decision`);
}

function normalizeModeratorDecision(decision: ModeratorDecision, roundNumber: number): ModeratorDecision {
  return roundNumber === 1 && decision === "end_discussion" ? "continue" : decision;
}

function expectString(value: unknown, field: string, roundNumber: number): string {
  if (typeof value !== "string") throw new Error(`Moderator review for round ${roundNumber} must include string field '${field}'`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
