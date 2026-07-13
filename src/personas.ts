import { resolve } from "node:path";
import type { LoadedSessionConfig, MindConfig } from "./config";
import type { ChatModel } from "./models/types";
import { readUtf8Text } from "./text-io";

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
      const personaSource = await readUtf8Text(personaPath);
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
