import { dirname, resolve } from "node:path";
import { readUtf8Text } from "./text-io";

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

export interface MindReferenceConfig {
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

export interface ParsedSessionConfig extends Omit<SessionConfig, "minds" | "disabledMinds"> {
  minds: MindReferenceConfig[];
  disabledMinds?: MindReferenceConfig[];
}

export interface LoadedSessionConfig extends SessionConfig {
  configPath: string;
  configDir: string;
}

export async function loadSessionConfig(configPath: string): Promise<LoadedSessionConfig> {
  const absolutePath = resolve(configPath);
  const raw = await readUtf8Text(absolutePath);
  const parsed = JSON.parse(raw) as unknown;
  const config = parseSessionConfig(parsed);
  const configDir = dirname(absolutePath);
  const minds = await loadMindConfigs(config.minds, configDir, "minds");
  const disabledMinds =
    config.disabledMinds === undefined ? undefined : await loadMindConfigs(config.disabledMinds, configDir, "disabledMinds");

  return {
    ...config,
    minds,
    disabledMinds,
    configPath: absolutePath,
    configDir,
  };
}

export function parseSessionConfig(value: unknown): ParsedSessionConfig {
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
      throw new Error(`mind '${mind.personaPath}' references unknown provider '${mind.provider}'`);
    }
  }

  for (const mind of disabledMinds ?? []) {
    if (!providers[mind.provider]) {
      throw new Error(`disabled mind '${mind.personaPath}' references unknown provider '${mind.provider}'`);
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

async function loadMindConfigs(minds: MindReferenceConfig[], configDir: string, label: string): Promise<MindConfig[]> {
  return Promise.all(
    minds.map(async (mind, index) => {
      const personaPath = resolve(configDir, mind.personaPath);
      const metadataPath = resolve(dirname(personaPath), "persona.json");
      const metadata = parsePersonaMetadata(JSON.parse(await readUtf8Text(metadataPath)) as unknown, `${label}[${index}] metadata`);

      return {
        ...mind,
        ...metadata,
      };
    }),
  );
}

function parsePersonaMetadata(value: unknown, label: string): Pick<MindConfig, "id" | "name"> {
  const metadata = expectRecord(value, label);

  return {
    id: expectString(metadata.id, `${label}.id`),
    name: expectString(metadata.name, `${label}.name`),
  };
}

function parseMinds(value: unknown, label = "minds", options: { allowEmpty?: boolean } = {}): MindReferenceConfig[] {
  if (!Array.isArray(value) || (!options.allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be a non-empty array`);
  }

  return value.map((mindValue, index) => {
    const mind = expectRecord(mindValue, `${label}[${index}]`);

    return {
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
