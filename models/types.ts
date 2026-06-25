export type MessageRole = "developer" | "system" | "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface GenerateOptions {
  maxOutputTokens?: number;
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
