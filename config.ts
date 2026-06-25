import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type ProviderType = "openai" | "anthropic" | "deepseek";

export interface ProviderConfig {
  type: ProviderType;
  model: string;
  apiKeyEnv: string;
  reasoningEffort?: "high" | "max";
}

export interface MindConfig {
  id: string;
  name: string;
  personaPath: string;
  provider: string;
}

export interface SessionConfig {
  topic: string;
  context: unknown;
  testMode: boolean;
  workingLanguage?: string;
  moderatorProvider: string;
  providers: Record<string, ProviderConfig>;
  minds: MindConfig[];
  disabledMinds?: MindConfig[];
}

export interface LoadedSessionConfig extends SessionConfig {
  configPath: string;
  configDir: string;
}

export async function loadSessionConfig(configPath: string): Promise<LoadedSessionConfig> {
  const absolutePath = resolve(configPath);
  const raw = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const config = parseSessionConfig(parsed);

  return {
    ...config,
    configPath: absolutePath,
    configDir: dirname(absolutePath),
  };
}

export function parseSessionConfig(value: unknown): SessionConfig {
  const config = expectRecord(value, "session config");

  const topic = expectString(config.topic, "topic");
  if (!("context" in config)) {
    throw new Error("session config must include context");
  }
  const testMode = config.testMode === undefined ? false : expectBoolean(config.testMode, "testMode");
  const workingLanguage =
    config.workingLanguage === undefined ? undefined : expectString(config.workingLanguage, "workingLanguage");

  const moderatorProvider = expectString(config.moderatorProvider, "moderatorProvider");
  const providers = parseProviders(config.providers);
  const minds = parseMinds(config.minds);
  const disabledMinds =
    config.disabledMinds === undefined ? undefined : parseMinds(config.disabledMinds, "disabledMinds", { allowEmpty: true });

  if (!providers[moderatorProvider]) {
    throw new Error(`moderatorProvider '${moderatorProvider}' is not defined in providers`);
  }

  for (const mind of minds) {
    if (!providers[mind.provider]) {
      throw new Error(`mind '${mind.id}' references unknown provider '${mind.provider}'`);
    }
  }

  for (const mind of disabledMinds ?? []) {
    if (!providers[mind.provider]) {
      throw new Error(`disabled mind '${mind.id}' references unknown provider '${mind.provider}'`);
    }
  }

  return {
    topic,
    context: config.context,
    testMode,
    workingLanguage,
    moderatorProvider,
    providers,
    minds,
    disabledMinds,
  };
}

function parseProviders(value: unknown): Record<string, ProviderConfig> {
  const providers = expectRecord(value, "providers");
  const parsed: Record<string, ProviderConfig> = {};

  for (const [key, providerValue] of Object.entries(providers)) {
    const provider = expectRecord(providerValue, `providers.${key}`);
    const type = expectString(provider.type, `providers.${key}.type`);

    if (type !== "openai" && type !== "anthropic" && type !== "deepseek") {
      throw new Error(`providers.${key}.type must be 'openai', 'anthropic', or 'deepseek'`);
    }

    parsed[key] = {
      type,
      model: expectString(provider.model, `providers.${key}.model`),
      apiKeyEnv: expectString(provider.apiKeyEnv, `providers.${key}.apiKeyEnv`),
      reasoningEffort: parseReasoningEffort(provider.reasoningEffort, `providers.${key}.reasoningEffort`),
    };
  }

  if (Object.keys(parsed).length === 0) {
    throw new Error("providers must include at least one provider");
  }

  return parsed;
}

function parseReasoningEffort(value: unknown, label: string): "high" | "max" | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "high" || value === "max") {
    return value;
  }

  throw new Error(`${label} must be 'high' or 'max'`);
}

function parseMinds(value: unknown, label = "minds", options: { allowEmpty?: boolean } = {}): MindConfig[] {
  if (!Array.isArray(value) || (!options.allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be a non-empty array`);
  }

  return value.map((mindValue, index) => {
    const mind = expectRecord(mindValue, `${label}[${index}]`);

    return {
      id: expectString(mind.id, `${label}[${index}].id`),
      name: expectString(mind.name, `${label}[${index}].name`),
      personaPath: expectString(mind.personaPath, `${label}[${index}].personaPath`),
      provider: expectString(mind.provider, `${label}[${index}].provider`),
    };
  });
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }

  return value;
}
