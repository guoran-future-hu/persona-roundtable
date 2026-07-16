import type { ChatMessage, ChatModel, GenerateOptions, HttpFetch, ReasoningEffort } from "./types";

export interface OpenRouterModelOptions {
  apiKey: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  fetch?: HttpFetch;
}

export class OpenRouterModel implements ChatModel {
  readonly provider = "openrouter";
  readonly model: string;
  private readonly apiKey: string;
  private readonly reasoningEffort?: ReasoningEffort;
  private readonly fetch: HttpFetch;

  constructor(options: OpenRouterModelOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.reasoningEffort = options.reasoningEffort;
    this.fetch = options.fetch ?? fetch;
  }

  async generate(messages: ChatMessage[], options: GenerateOptions = {}): Promise<string> {
    const body = {
      model: this.model,
      messages: messages.map((message) => ({
        role: normalizeRole(message.role),
        content: message.content,
      })),
      ...(options.thinkingEnabled === false || this.reasoningEffort !== undefined
        ? { reasoning: { effort: options.thinkingEnabled === false ? "none" : this.reasoningEffort } }
        : {}),
      ...(options.structuredOutput ? { response_format: { type: "json_schema", json_schema: { name: options.structuredOutput.name, strict: true, schema: options.structuredOutput.schema } } } : {}),
      max_tokens: options.maxOutputTokens ?? 1400,
      stream: false,
    };

    const response = await this.fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText} ${await response.text()}`);
    }

    return extractOpenRouterText(await response.json());
  }
}

export function extractOpenRouterText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error("OpenRouter response did not contain choices output.");
  }

  const firstChoice = payload.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message) || typeof firstChoice.message.content !== "string") {
    throw new Error("OpenRouter response did not contain message text output.");
  }

  const text = firstChoice.message.content.trim();

  if (!text) {
    throw new Error("OpenRouter response contained empty message text output.");
  }

  return text;
}

function normalizeRole(role: ChatMessage["role"]): "system" | "user" | "assistant" {
  return role === "developer" ? "system" : role;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
