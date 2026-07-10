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

  for (const mind of config.minds) {
    push(mind.provider, "[" + mind.id + ", opening]");
    pushCompression("[" + mind.id + ", opening compressed]");
  }

  push(config.moderatorProvider, buildModeratorReview(1));
  pushCompression("[moderator, opening compressed]");

  const effectiveMaxTurns = config.maxTurns ?? config.maxRounds * config.minds.length;
  if (effectiveMaxTurns > config.minds.length) {
    const eligibleMinds = config.minds.slice(0, -1);
    for (const [index, mind] of eligibleMinds.entries()) {
      push(
        mind.provider,
        JSON.stringify({ urgency: index === 0 ? "minor_update" : "no_new_comment" }),
      );
    }

    const selectedMind = eligibleMinds[0]!;
    push(
      selectedMind.provider,
      JSON.stringify({ content: "[" + selectedMind.id + ", dynamic turn]", inviteMindId: null }),
    );
    pushCompression("[" + selectedMind.id + ", dynamic turn compressed]");
    push(
      config.moderatorProvider,
      JSON.stringify({
        action: "end_discussion",
        checkpointSummary: "",
        progressNote: "",
        comparisonToPrevious: "",
        endReason: "[moderator, deterministic dynamic stop]",
      }),
    );
  }

  push(config.moderatorProvider, "[moderator, final summary]");

  return Object.fromEntries(
    Object.entries(queues).map(([providerName, responses]) => [providerName, new DummyModel(responses)]),
  );
}

function buildModeratorReview(roundNumber: number): string {
  return JSON.stringify({
    roundSummary: `[moderator, round ${roundNumber} summary]`,
    progressNote: `[moderator, round ${roundNumber} progress]`,
    comparisonToPrevious: roundNumber === 1 ? "No previous progress note." : `[moderator, round ${roundNumber} comparison]`,
    decision: "continue",
    endReason: "",
  });
}
