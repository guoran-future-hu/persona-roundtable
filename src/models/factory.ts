import type { LoadedSessionConfig } from "../config";
import { AnthropicModel } from "./anthropic";
import { DeepSeekModel } from "./deepseek";
import { OpenAIModel } from "./openai";
import { OpenRouterModel } from "./openrouter";
import type { ChatModel } from "./types";

export function createModels(config: LoadedSessionConfig): Record<string, ChatModel> {
  const requiredProviders = new Set([config.moderatorProvider, ...config.minds.map((mind) => mind.provider)]);
  if (config.compressionEnabled !== false && config.compressionProvider !== undefined) {
    requiredProviders.add(config.compressionProvider);
  }
  if (config.urgencyProvider !== undefined) {
    requiredProviders.add(config.urgencyProvider);
  }
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

    if (provider.type === "openai" || provider.type === "codex") {
      models[providerName] = new OpenAIModel({ apiKey, model: provider.model, reasoningEffort: provider.reasoningEffort });
      continue;
    }

    if (provider.type === "anthropic" || provider.type === "claude") {
      models[providerName] = new AnthropicModel({ apiKey, model: provider.model, reasoningEffort: provider.reasoningEffort });
      continue;
    }

    if (provider.type === "openrouter") {
      models[providerName] = new OpenRouterModel({ apiKey, model: provider.model, reasoningEffort: provider.reasoningEffort });
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
