import type { ModelCallLog, RunOptions, SpeakerOutputPhase } from "./session-types";
import { buildCompressionMessages } from "./discussion-prompts";
import { generateAndLog } from "./model-calls";
import { formatPhaseLabel } from "./session-formatters";
import type { PromptTemplateSet } from "./prompt-templates";

const COMPRESSION_MAX_OUTPUT_TOKENS = 400;

export async function handleSpeakerOutput({
  topic,
  outputLanguage,
  phase,
  speaker,
  content,
  modelCalls,
  options,
  promptTemplates,
}: {
  topic: string;
  outputLanguage: string;
  phase: SpeakerOutputPhase;
  speaker: string;
  content: string;
  modelCalls: ModelCallLog[];
  options: RunOptions;
  promptTemplates: PromptTemplateSet;
}): Promise<void> {
  const phaseLabel = formatPhaseLabel(phase);
  if (!options.compressionModel) {
    options.onSpeakerOutput?.({ phase, phaseLabel, speaker, content });
    return;
  }

  const messages = buildCompressionMessages(topic, outputLanguage, phaseLabel, speaker, content, promptTemplates);
  try {
    const compressed = await generateAndLog({
      phase: "compression",
      speaker,
      model: options.compressionModel,
      messages,
      modelCalls,
      generateOptions: { maxOutputTokens: COMPRESSION_MAX_OUTPUT_TOKENS, thinkingEnabled: false },
    });
    options.onCompressedOutput?.({ phase, phaseLabel, speaker, content: compressed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.onCompressedOutput?.({ phase, phaseLabel, speaker, content: `[compression failed: ${message}]` });
  }
}
