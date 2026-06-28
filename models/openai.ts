import type { ChatMessage, ChatModel, GenerateOptions, HttpFetch } from "./types";

export interface OpenAIModelOptions {
  apiKey: string;
  model: string;
  fetch?: HttpFetch;
}

export class OpenAIModel implements ChatModel {
  readonly provider = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetch: HttpFetch;

  constructor(options: OpenAIModelOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.fetch = options.fetch ?? fetch;
  }

  async generate(messages: ChatMessage[], options: GenerateOptions = {}): Promise<string> {
    const body = {
      model: this.model,
      input: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      ...(options.thinkingEnabled === false ? { reasoning: { effort: "none" } } : {}),
      max_output_tokens: options.maxOutputTokens ?? 1400,
    };

    const response = await this.fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status} ${response.statusText} ${await response.text()}`);
    }

    return extractOpenAIText(await response.json());
  }
}

export function extractOpenAIText(payload: unknown): string {
  if (isRecord(payload) && typeof payload.output_text === "string") {
    return payload.output_text.trim();
  }

  if (isRecord(payload) && Array.isArray(payload.output)) {
    const text = payload.output
      .flatMap((item) => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
      .map((content) => {
        if (!isRecord(content)) {
          return "";
        }

        if (typeof content.text === "string") {
          return content.text;
        }

        if (typeof content.value === "string") {
          return content.value;
        }

        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();

    if (text) {
      return text;
    }
  }

  throw new Error("OpenAI response did not contain text output.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
