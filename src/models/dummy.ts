import type { LoadedSessionConfig } from "../config";
import type { ChatMessage, ChatModel } from "./types";

export class DummyModel implements ChatModel {
  readonly provider = "dummy";
  readonly model = "dummy";
  readonly calls: ChatMessage[][] = [];
  private readonly responses: string[];

  constructor(responses: string[]) {
    this.responses = [...responses];
  }

  async generate(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);

    const response = this.responses.shift();
    if (response === undefined) {
      throw new Error("DummyModel has no queued response left");
    }

    return response;
  }
}

export function createDummyModels(config: LoadedSessionConfig): Record<string, ChatModel> {
  if ((config.discussionMode ?? "simple") === "dynamic") {
    return createDynamicDummyModels(config);
  }

  const queues: Record<string, string[]> = {};

  function push(providerName: string, response: string): void {
    queues[providerName] ??= [];
    queues[providerName].push(response);
  }

  function pushCompression(response: string): void {
    if (config.compressionProvider !== undefined) {
      push(config.compressionProvider, response);
    }
  }

  for (let roundNumber = 1; roundNumber <= config.maxRounds; roundNumber += 1) {
    for (const mind of config.minds) {
      push(mind.provider, `[${mind.id}, round ${roundNumber}]`);
      pushCompression(`[${mind.id}, round ${roundNumber} compressed]`);
    }

    push(config.moderatorProvider, buildModeratorReview(roundNumber));
    pushCompression(`[moderator, round ${roundNumber} compressed]`);
  }

  push(config.moderatorProvider, "[moderator, final summary]");

  return Object.fromEntries(
    Object.entries(queues).map(([providerName, responses]) => [providerName, new DummyModel(responses)]),
  );
}

function createDynamicDummyModels(config: LoadedSessionConfig): Record<string, ChatModel> {
  return Object.fromEntries(
    [...new Set([config.moderatorProvider, ...config.minds.map((mind) => mind.provider), config.compressionProvider, config.urgencyProvider])]
      .filter((providerName): providerName is string => providerName !== undefined)
      .map((providerName) => [providerName, new DynamicDummyModel(config, providerName)]),
  );
}

class DynamicDummyModel implements ChatModel {
  readonly provider = "dummy";
  readonly model = "dummy";
  readonly calls: ChatMessage[][] = [];

  constructor(
    private readonly config: LoadedSessionConfig,
    private readonly providerName: string,
  ) {}

  async generate(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);
    const prompt = messages.map((message) => message.content).join("\n");

    if (prompt.includes("Compress this segment of conversation.")) {
      return "[test mode, compressed output]";
    }

    if (prompt.includes("You are the moderator of a dynamic roundtable discussion.")) {
      return this.dynamicModeratorResponse();
    }

    if (prompt.includes('{"urgency":"no_new_comment | minor_update | strong_need_to_respond"}')) {
      return JSON.stringify({ urgency: choose(["no_new_comment", "minor_update", "strong_need_to_respond"]) });
    }

    if (prompt.includes('"inviteMindId": null')) {
      const mind = this.findMind(prompt);
      const invitees = this.config.minds.filter((candidate) => candidate.id !== mind.id);
      const inviteMindId = Math.random() < 0.5 ? null : choose(invitees).id;
      return JSON.stringify({
        content: `[${mind.id}, test-mode dynamic response with random invitation behavior]`,
        inviteMindId,
      });
    }

    if (prompt.includes("You are playing ")) {
      return `[${this.findMind(prompt).id}, opening]`;
    }

    if (prompt.includes("<stop_reason>")) {
      return "[moderator, test-mode final summary]";
    }

    if (prompt.includes("You are the moderator of a roundtable discussion.")) {
      return buildModeratorReview(1);
    }

    return "[test mode, unrecognized prompt]";
  }

  private dynamicModeratorResponse(): string {
    const action = choose(["continue", "summarize", "end_discussion"] as const);
    if (action === "summarize") {
      return JSON.stringify({
        action,
        checkpointSummary: "[test mode, random checkpoint summary]",
        progressAssessment: "[test mode, random checkpoint progress]",
        endReason: "",
      });
    }

    return JSON.stringify({
      action,
      checkpointSummary: "",
      progressAssessment: "",
      endReason: action === "end_discussion" ? "[test mode, random moderator stop]" : "",
    });
  }

  private findMind(prompt: string): LoadedSessionConfig["minds"][number] {
    const mindName = /<persona_card id="([^"]+)">/.exec(prompt)?.[1];
    return (
      this.config.minds.find((mind) => mind.name === mindName) ??
      this.config.minds.find((mind) => mind.provider === this.providerName) ??
      this.config.minds[0]!
    );
  }
}

function choose<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}
function buildModeratorReview(roundNumber: number): string {
  return JSON.stringify({
    roundSummary: `[moderator, round ${roundNumber} summary]`,
    progressAssessment: `[moderator, round ${roundNumber} progress]`,
    decision: "continue",
    endReason: "",
  });
}
