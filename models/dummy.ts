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

function buildModeratorReview(roundNumber: number): string {
  return JSON.stringify({
    roundSummary: `[moderator, round ${roundNumber} summary]`,
    progressNote: `[moderator, round ${roundNumber} progress]`,
    comparisonToPrevious: roundNumber === 1 ? "No previous progress note." : `[moderator, round ${roundNumber} comparison]`,
    decision: "continue",
    endReason: "",
  });
}
