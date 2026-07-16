import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { loadSessionConfig } from "./config";
import { createDummyModels } from "./models/dummy";
import { createModels } from "./models/factory";
import { runRoundtableSession, SessionRunError, type RunOptions } from "./orchestrator";
import { loadMinds } from "./personas";
import { createTranscriptPath, saveTranscript, saveUserTranscript } from "./transcript";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const envFile = args.envFile ?? ".env";
  loadDotenv({ path: envFile, override: args.envFile !== undefined });

  const configPath = args.config ?? "config.json";

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Create config.json or pass --config <path>.`);
  }

  console.log("Richer context gives the minds more to work with; edit the context fields in the session JSON before running.");

  const loadedConfig = await loadSessionConfig(configPath);
  const config = args.testMode ? { ...loadedConfig, testMode: true } : loadedConfig;
  const models = config.testMode ? createDummyModels(config) : createModels(config);
  const minds = await loadMinds(config, models);
  const moderatorModel = models[config.moderatorProvider];
  const compressionModel = config.compressionProvider === undefined ? undefined : models[config.compressionProvider];
  const urgencyModel = config.urgencyProvider === undefined ? undefined : models[config.urgencyProvider];

  if (!moderatorModel) {
    throw new Error(`No model configured for moderator provider '${config.moderatorProvider}'`);
  }

  if (config.compressionProvider !== undefined && !compressionModel) {
    throw new Error(`No model configured for compression provider '${config.compressionProvider}'`);
  }

  if (config.urgencyProvider !== undefined && !urgencyModel) {
    throw new Error(`No model configured for urgency provider '${config.urgencyProvider}'`);
  }

  const liveTranscriptPath = createTranscriptPath(config);
  const runOptions: RunOptions = {
    moderatorModel,
    compressionModel,
    onProgress: (message) => console.log(message),
    onSessionUpdate: (snapshot) => saveUserTranscript(config, snapshot, liveTranscriptPath),
    onSpeakerOutput: (output) => {
      console.log(output.content);
    },
    onCompressedOutput: (output) => {
      console.log(output.content);
    },
  };

  const result = await runRoundtableSession(config, minds, runOptions).catch(async (error: unknown) => {
    if (error instanceof SessionRunError) {
      const { transcriptPath, devLogPath, speakerCountLogPath } = await saveTranscript(config, error.partialResult, "sessions", liveTranscriptPath);
      console.error(`Partial transcript saved: ${transcriptPath}`);
      console.error(`Partial dev log saved: ${devLogPath}`);
      console.error(`Speaker counts saved: ${speakerCountLogPath}`);
    }

    throw error;
  });

  const { transcriptPath, devLogPath, speakerCountLogPath } = await saveTranscript(config, result, "sessions", liveTranscriptPath);
  console.log(`Session ended: ${result.stopReason ?? "Discussion ended."}`);
  console.log(`Transcript saved: ${transcriptPath}`);
  console.log(`Dev log saved: ${devLogPath}`);
  console.log(`Speaker counts saved: ${speakerCountLogPath}`);
}

function parseArgs(args: string[]): { config?: string; envFile?: string; help: boolean; testMode?: boolean } {
  const parsed: { config?: string; envFile?: string; help: boolean; testMode?: boolean } = { help: false };

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

    if (arg === "--env-file") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("--env-file requires a path");
      }

      parsed.envFile = value;
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
  npm run roundtable
  npm run roundtable -- --config path/to/config.json
  npm run roundtable -- --config path/to/config.json --env-file path/to/.env

The JSON config is the single source of truth for a session. Put the topic and rich context there.
The default files are config.json and .env. Use --config and --env-file to select alternate files explicitly.
Use --test-mode to force deterministic dummy models for a single run.
Richer context gives the minds more to work with: goals, constraints, values, history, and current circumstances.
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
