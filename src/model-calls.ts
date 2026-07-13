import type { ChatMessage, ChatModel, GenerateOptions, StructuredOutputSpec } from "./models/types";
import type { ModelCallLog } from "./session-types";

export async function generateStructuredAndLog<T>({
  phase,
  speaker,
  model,
  messages,
  modelCalls,
  generateOptions,
  structuredOutput,
  parse,
}: {
  phase: ModelCallLog["phase"];
  speaker: string;
  model: ChatModel;
  messages: ChatMessage[];
  modelCalls: ModelCallLog[];
  generateOptions: GenerateOptions;
  structuredOutput: StructuredOutputSpec;
  parse: (raw: string) => T;
}): Promise<T> {
  let retryMessages = messages;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = await generateAndLog({
      phase,
      speaker,
      model,
      messages: retryMessages,
      modelCalls,
      generateOptions: { ...generateOptions, structuredOutput },
      attempt,
    });

    try {
      const parsed = parse(raw);
      modelCalls.at(-1)!.successful = true;
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const call = modelCalls.at(-1)!;
      call.successful = false;
      call.validationError = lastError.message;
      retryMessages = [
        ...messages,
        { role: "assistant", content: raw },
        { role: "user", content: "Your previous response failed validation: " + lastError.message + ". Return only a corrected response matching the required schema." },
      ];
    }
  }

  throw lastError!;
}

export async function generateAndLog({
  phase,
  speaker,
  model,
  messages,
  modelCalls,
  generateOptions,
  attempt,
}: {
  phase: ModelCallLog["phase"];
  speaker: string;
  model: ChatModel;
  messages: ChatMessage[];
  modelCalls: ModelCallLog[];
  generateOptions?: Parameters<ChatModel["generate"]>[1];
  attempt?: number;
}): Promise<string> {
  try {
    const response = await model.generate(messages, generateOptions);
    modelCalls.push({ phase, speaker, provider: model.provider, model: model.model, messages, response, attempt, successful: true });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    modelCalls.push({ phase, speaker, provider: model.provider, model: model.model, messages, response: `[ERROR] ${message}`, attempt, successful: false });
    throw error;
  }
}
