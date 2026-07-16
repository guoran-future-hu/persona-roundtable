import type { SessionConfig } from "./config";
import { buildUrgencyMessages } from "./discussion-prompts";
import { generateStructuredAndLog } from "./model-calls";
import type { LoadedMind } from "./personas";
import { defaultPromptTemplates, type PromptTemplateSet } from "./prompt-templates";
import { parseUrgencyResponse, urgencySpec } from "./structured-output";
import type {
  DynamicModeratorCheck,
  DynamicTurn,
  ModelCallLog,
  ModeratorReview,
  NextSpeakerSelection,
  RoundResult,
  RunOptions,
  UrgencyPoll,
  UrgencySignal,
} from "./session-types";

export async function selectNextByUrgency({
  afterTurnNumber,
  previousMindId,
  config,
  context,
  outputLanguage,
  minds,
  rounds,
  moderatorReviews,
  modelCalls,
  urgencyPolls,
  dynamicTurns,
  dynamicModeratorChecks,
  promptTemplates,
  options,
}: {
  afterTurnNumber: number;
  previousMindId: string;
  config: SessionConfig;
  context: string;
  outputLanguage: string;
  minds: LoadedMind[];
  rounds: RoundResult[];
  moderatorReviews: ModeratorReview[];
  modelCalls: ModelCallLog[];
  urgencyPolls: UrgencyPoll[];
  dynamicTurns?: DynamicTurn[];
  dynamicModeratorChecks?: DynamicModeratorCheck[];
  promptTemplates?: PromptTemplateSet;
  options: RunOptions;
}): Promise<NextSpeakerSelection | undefined> {
  const eligibleMinds = minds.filter((mind) => mind.id !== previousMindId);
  options.onProgress?.("Urgency poll after turn " + afterTurnNumber);
  const templates = promptTemplates ?? defaultPromptTemplates;

  const signalResults = await Promise.allSettled(
    eligibleMinds.map(async (mind): Promise<UrgencySignal> => {
      const messages = buildUrgencyMessages(
        config.topic,
        context,
        outputLanguage,
        mind,
        minds,
        rounds,
        moderatorReviews,
        { dynamicTurns, urgencyPolls, dynamicModeratorChecks },
        templates,
      );
      return {
        mindId: mind.id,
        mindName: mind.name,
        urgency: await generateStructuredAndLog({
          phase: urgencyPhase(afterTurnNumber),
          speaker: mind.name,
          model: options.urgencyModel ?? mind.model,
          messages,
          modelCalls,
          generateOptions: { maxOutputTokens: 128, thinkingEnabled: false },
          structuredOutput: urgencySpec,
          parse: (raw) => parseUrgencyResponse(raw, afterTurnNumber, mind),
        }),
      };
    }),
  );
  const signals = signalResults.map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });

  const highestUrgency = signals.some((signal) => signal.urgency === "strong_need_to_respond")
    ? "strong_need_to_respond"
    : signals.some((signal) => signal.urgency === "minor_update")
      ? "minor_update"
      : undefined;
  const highestUrgencySignals = highestUrgency === undefined ? [] : signals.filter((signal) => signal.urgency === highestUrgency);
  const speechCounts = countMindSpeeches(rounds);
  const fewestSpeeches = Math.min(...highestUrgencySignals.map((signal) => speechCounts.get(signal.mindId) ?? 0));
  const leastHeardSignals = highestUrgencySignals.filter((signal) => (speechCounts.get(signal.mindId) ?? 0) === fewestSpeeches);
  const selectedSignal = leastHeardSignals[Math.floor(Math.random() * leastHeardSignals.length)];
  urgencyPolls.push({ afterTurnNumber, signals, selectedMindId: selectedSignal?.mindId });

  if (!selectedSignal) return undefined;
  return {
    mind: minds.find((mind) => mind.id === selectedSignal.mindId)!,
    method: "urgency",
    selectedUrgency: selectedSignal.urgency,
  };
}

function countMindSpeeches(rounds: RoundResult[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const round of rounds) {
    for (const output of round.outputs) {
      counts.set(output.mindId, (counts.get(output.mindId) ?? 0) + 1);
    }
  }
  return counts;
}

function urgencyPhase(turnNumber: number): `urgency-after-turn-${number}` {
  return `urgency-after-turn-${turnNumber}`;
}
