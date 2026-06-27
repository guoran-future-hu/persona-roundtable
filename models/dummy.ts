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

  for (const mind of config.minds) {
    push(mind.provider, `[${mind.id}, round 1]`);
    pushCompression(`[${mind.id}, round 1 compressed]`);
  }

  for (const mind of config.minds) {
    push(mind.provider, `[${mind.id}, round 2]`);
    pushCompression(`[${mind.id}, round 2 compressed]`);
  }

  push(config.moderatorProvider, "[moderator, summary]");
  pushCompression("[moderator, summary compressed]");

  return Object.fromEntries(
    Object.entries(queues).map(([providerName, responses]) => [providerName, new DummyModel(responses)]),
  );
}
