import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { LoadedSessionConfig, MindConfig } from "./config";
import type { ChatModel } from "./models/types";

export interface LoadedMind extends MindConfig {
  persona: string;
  model: ChatModel;
}

export async function loadMinds(
  config: LoadedSessionConfig,
  modelsByProvider: Record<string, ChatModel>,
): Promise<LoadedMind[]> {
  return Promise.all(
    config.minds.map(async (mind) => {
      const personaPath = resolve(config.configDir, mind.personaPath);
      const personaSource = await readFile(personaPath, "utf8");
      const persona = config.testMode ? `[${mind.id}, persona]` : personaSource;
      const model = modelsByProvider[mind.provider];

      if (!model) {
        throw new Error(`No model instance exists for provider '${mind.provider}'`);
      }

      return {
        ...mind,
        persona,
        model,
      };
    }),
  );
}
