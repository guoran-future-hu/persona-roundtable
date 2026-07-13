export type MessageRole = "developer" | "system" | "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface GenerateOptions {
  maxOutputTokens?: number;
  /** false asks adapters to disable provider reasoning/thinking when their API supports it. */
  thinkingEnabled?: boolean;
  structuredOutput?: StructuredOutputSpec;
}

export interface StructuredOutputSpec {
  name: string;
  schema: Record<string, unknown>;
}

export interface ChatModel {
  readonly provider: string;
  readonly model: string;
  generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string>;
}

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type HttpFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<HttpResponseLike>;
