import { existsSync } from "node:fs";
import "dotenv/config";
import { loadSessionConfig } from "./config";
import { createDummyModels } from "./models/dummy";
import { createModels } from "./models/factory";
import { runRoundtableSession, SessionRunError, type RunOptions } from "./orchestrator";
import { loadMinds } from "./personas";
import { saveTranscript } from "./transcript";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const configPath = args.config ?? "config.json";

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Copy config-example.json to config.json and edit it.`);
  }

  console.log("Richer context gives the minds more to work with; edit the context fields in the session JSON before running.");

  const loadedConfig = await loadSessionConfig(configPath);
  const config = args.testMode ? { ...loadedConfig, testMode: true } : loadedConfig;
  const models = config.testMode ? createDummyModels(config) : createModels(config);
  const minds = await loadMinds(config, models);
  const moderatorModel = models[config.moderatorProvider];
  const compressionModel = config.compressionProvider === undefined ? undefined : models[config.compressionProvider];

  if (!moderatorModel) {
    throw new Error(`No model configured for moderator provider '${config.moderatorProvider}'`);
  }

  if (config.compressionProvider !== undefined && !compressionModel) {
    throw new Error(`No model configured for compression provider '${config.compressionProvider}'`);
  }

  const runOptions: RunOptions = {
    moderatorModel,
    compressionModel,
    onProgress: (message) => console.log(message),
    onSpeakerOutput: (output) => {
      console.log(output.content);
    },
    onCompressedOutput: (output) => {
      console.log(output.content);
    },
  };

  const result = await runRoundtableSession(config, minds, runOptions).catch(async (error: unknown) => {
    if (error instanceof SessionRunError) {
      const { transcriptPath, devLogPath } = await saveTranscript(config, error.partialResult);
      console.error(`Partial transcript saved: ${transcriptPath}`);
      console.error(`Partial dev log saved: ${devLogPath}`);
    }

    throw error;
  });

  const { transcriptPath, devLogPath } = await saveTranscript(config, result);
  console.log(`Transcript saved: ${transcriptPath}`);
  console.log(`Dev log saved: ${devLogPath}`);
}

function parseArgs(args: string[]): { config?: string; help: boolean; testMode?: boolean } {
  const parsed: { config?: string; help: boolean; testMode?: boolean } = { help: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--config") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("--config requires a path");
      }

      parsed.config = value;
      index += 1;
      continue;
    }

    if (arg === "--test-mode") {
      parsed.testMode = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printHelp(): void {
  console.log(`persona-roundtable MVP

Usage:
  npm run roundtable -- --config config.json
  npm run roundtable -- --config config.json --test-mode

The JSON config is the single source of truth for a session. Put the topic and rich context there.
Use --test-mode to force deterministic dummy models for a single run.
Richer context gives the minds more to work with: goals, constraints, values, history, and current circumstances.
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
