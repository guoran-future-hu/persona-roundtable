import type { ChatMessage, ChatModel, GenerateOptions, HttpFetch } from "./types";

export interface AnthropicModelOptions {
  apiKey: string;
  model: string;
  fetch?: HttpFetch;
}

export class AnthropicModel implements ChatModel {
  readonly provider = "anthropic";
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetch: HttpFetch;

  constructor(options: AnthropicModelOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.fetch = options.fetch ?? fetch;
  }

  async generate(messages: ChatMessage[], options: GenerateOptions = {}): Promise<string> {
    const system = messages
      .filter((message) => message.role === "system" || message.role === "developer")
      .map((message) => message.content)
      .join("\n\n");

    const conversation = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    const response = await this.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxOutputTokens ?? 1400,
        system,
        messages: conversation,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed: ${response.status} ${response.statusText} ${await response.text()}`);
    }

    return extractAnthropicText(await response.json());
  }
}

export function extractAnthropicText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.content)) {
    throw new Error("Anthropic response did not contain content output.");
  }

  const text = payload.content
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Anthropic response did not contain text output.");
  }

  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
