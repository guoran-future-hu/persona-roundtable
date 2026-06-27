import type { ChatMessage, ChatModel, GenerateOptions, HttpFetch } from "./types";

export interface DeepSeekModelOptions {
  apiKey: string;
  model: string;
  fetch?: HttpFetch;
  reasoningEffort?: "high" | "max";
}

export class DeepSeekModel implements ChatModel {
  readonly provider = "deepseek";
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetch: HttpFetch;
  private readonly reasoningEffort: "high" | "max";

  constructor(options: DeepSeekModelOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.fetch = options.fetch ?? fetch;
    this.reasoningEffort = options.reasoningEffort ?? "high";
  }

  async generate(messages: ChatMessage[], options: GenerateOptions = {}): Promise<string> {
    const response = await this.fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((message) => ({
          role: normalizeRole(message.role),
          content: message.content,
        })),
        thinking: { type: "enabled" },
        reasoning_effort: this.reasoningEffort,
        max_tokens: options.maxOutputTokens ?? 1400,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek request failed: ${response.status} ${response.statusText} ${await response.text()}`);
    }

    return extractDeepSeekText(await response.json());
  }
}

export function extractDeepSeekText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error("DeepSeek response did not contain choices output.");
  }

  const firstChoice = payload.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message) || typeof firstChoice.message.content !== "string") {
    throw new Error("DeepSeek response did not contain message text output.");
  }

  const text = firstChoice.message.content.trim();

  if (!text) {
    const finishReason = typeof firstChoice.finish_reason === "string" ? firstChoice.finish_reason : "unknown";
    throw new Error(`DeepSeek response contained empty message text output. finish_reason=${finishReason}`);
  }

  return text;
}

function normalizeRole(role: ChatMessage["role"]): "system" | "user" | "assistant" {
  return role === "developer" ? "system" : role;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
