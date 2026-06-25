import type { LoadedSessionConfig } from "../config";
import { AnthropicModel } from "./anthropic";
import { DeepSeekModel } from "./deepseek";
import { OpenAIModel } from "./openai";
import type { ChatModel } from "./types";

export function createModels(config: LoadedSessionConfig): Record<string, ChatModel> {
  const requiredProviders = new Set([config.moderatorProvider, ...config.minds.map((mind) => mind.provider)]);
  const models: Record<string, ChatModel> = {};

  for (const providerName of requiredProviders) {
    const provider = config.providers[providerName];

    if (!provider) {
      throw new Error(`Provider '${providerName}' is not defined`);
    }

    const apiKey = process.env[provider.apiKeyEnv];

    if (!apiKey) {
      throw new Error(`Missing API key environment variable '${provider.apiKeyEnv}' for provider '${providerName}'`);
    }

    if (provider.type === "openai") {
      models[providerName] = new OpenAIModel({ apiKey, model: provider.model });
      continue;
    }

    if (provider.type === "anthropic") {
      models[providerName] = new AnthropicModel({ apiKey, model: provider.model });
      continue;
    }

    models[providerName] = new DeepSeekModel({
      apiKey,
      model: provider.model,
      reasoningEffort: provider.reasoningEffort ?? "high",
    });
  }

  return models;
}
