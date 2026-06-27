import type { SessionConfig } from "./config";
import type { LoadedMind } from "./personas";
import type { ChatMessage, ChatModel } from "./models/types";
import { defaultPromptTemplates, renderTemplate, type PromptTemplateSet } from "./prompt-templates";

const MAIN_RESPONSE_MAX_OUTPUT_TOKENS = 8192;
const COMPRESSION_MAX_OUTPUT_TOKENS = 400;

export interface RoundOutput {
  mindId: string;
  mindName: string;
  content: string;
}

export interface SessionResult {
  topic: string;
  context: unknown;
  modelCalls: ModelCallLog[];
  roundOne: RoundOutput[];
  roundTwo: RoundOutput[];
  moderatorSummary: string;
  error?: string;
}

export type SpeakerOutputPhase = "round-one" | "round-two" | "moderator-summary";

export interface ModelCallLog {
  phase: SpeakerOutputPhase | "compression";
  speaker: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  response: string;
}

export interface CompressedOutput {
  phase: SpeakerOutputPhase;
  phaseLabel: string;
  speaker: string;
  content: string;
}

export interface SpeakerOutput {
  phase: SpeakerOutputPhase;
  phaseLabel: string;
  speaker: string;
  content: string;
}

export interface RunOptions {
  moderatorModel: ChatModel;
  compressionModel?: ChatModel;
  promptTemplates?: PromptTemplateSet;
  onProgress?: (message: string) => void;
  onCompressedOutput?: (output: CompressedOutput) => void;
  onSpeakerOutput?: (output: SpeakerOutput) => void;
}

export class SessionRunError extends Error {
  readonly partialResult: SessionResult;

  constructor(message: string, partialResult: SessionResult) {
    super(message);
    this.name = "SessionRunError";
    this.partialResult = partialResult;
  }
}

export async function runRoundtableSession(
  config: SessionConfig,
  minds: LoadedMind[],
  options: RunOptions,
): Promise<SessionResult> {
  const context = serializeContext(config.context);
  const workingLanguage = config.workingLanguage ?? "Use the user's language unless the persona has a stronger reason to do otherwise.";
  const roundOne: RoundOutput[] = [];
  const roundTwo: RoundOutput[] = [];
  const modelCalls: ModelCallLog[] = [];
  const promptTemplates = options.promptTemplates ?? defaultPromptTemplates;

  try {
    for (const mind of minds) {
      options.onProgress?.(`Round 1: ${mind.name}`);
      const messages = buildRoundOneMessages(config.topic, context, workingLanguage, mind, minds, promptTemplates);
      const content = await generateAndLog({
        phase: "round-one",
        speaker: mind.name,
        model: mind.model,
        messages,
        modelCalls,
        generateOptions: { maxOutputTokens: MAIN_RESPONSE_MAX_OUTPUT_TOKENS },
      });
      roundOne.push({ mindId: mind.id, mindName: mind.name, content });
      await handleSpeakerOutput({
        topic: config.topic,
        workingLanguage,
        phase: "round-one",
        speaker: mind.name,
        content,
        modelCalls,
        options,
        promptTemplates,
      });
    }

    for (const mind of minds) {
      options.onProgress?.(`Round 2: ${mind.name}`);
      const messages = buildRoundTwoMessages(config.topic, context, workingLanguage, mind, roundOne, promptTemplates);
      const content = await generateAndLog({
        phase: "round-two",
        speaker: mind.name,
        model: mind.model,
        messages,
        modelCalls,
        generateOptions: { maxOutputTokens: MAIN_RESPONSE_MAX_OUTPUT_TOKENS },
      });
      roundTwo.push({ mindId: mind.id, mindName: mind.name, content });
      await handleSpeakerOutput({
        topic: config.topic,
        workingLanguage,
        phase: "round-two",
        speaker: mind.name,
        content,
        modelCalls,
        options,
        promptTemplates,
      });
    }

    options.onProgress?.("Moderator summary");
    const moderatorMessages = buildModeratorMessages(config.topic, context, workingLanguage, roundOne, roundTwo, promptTemplates);
    const moderatorSummary = await generateAndLog({
      phase: "moderator-summary",
      speaker: "Moderator",
      model: options.moderatorModel,
      messages: moderatorMessages,
      modelCalls,
      generateOptions: { maxOutputTokens: MAIN_RESPONSE_MAX_OUTPUT_TOKENS },
    });
    await handleSpeakerOutput({
      topic: config.topic,
      workingLanguage,
      phase: "moderator-summary",
      speaker: "Moderator",
      content: moderatorSummary,
      modelCalls,
      options,
      promptTemplates,
    });

    return buildSessionResult(config, modelCalls, roundOne, roundTwo, moderatorSummary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SessionRunError(message, buildSessionResult(config, modelCalls, roundOne, roundTwo, "", message));
  }
}

export function buildRoundOneMessages(
  topic: string,
  context: string,
  workingLanguage: string,
  mind: LoadedMind,
  minds: LoadedMind[],
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  const otherMindNames = minds
    .filter((candidate) => candidate.id !== mind.id)
    .map((candidate) => candidate.name)
    .join(", ");
  const activeMindNames = formatActiveMindNames(minds);

  return renderTemplate(promptTemplates.roundOne, {
    mind_name: mind.name,
    active_mind_names: activeMindNames,
    other_mind_names: otherMindNames,
    working_language: workingLanguage,
    persona: mind.persona,
    topic,
    context,
  });
}

export function buildRoundTwoMessages(
  topic: string,
  context: string,
  workingLanguage: string,
  mind: LoadedMind,
  roundOne: RoundOutput[],
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.roundTwo, {
    mind_name: mind.name,
    active_mind_names: formatActiveMindNames(roundOne),
    working_language: workingLanguage,
    persona: mind.persona,
    topic,
    context,
    round_one_opinions: formatRoundOneOpinions(roundOne),
  });
}

export function buildModeratorMessages(
  topic: string,
  context: string,
  workingLanguage: string,
  roundOne: RoundOutput[],
  roundTwo: RoundOutput[],
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.moderator, {
    working_language: workingLanguage,
    topic,
    context,
    round_one_opinions: formatRoundOneOpinions(roundOne),
    round_two_opinions: formatRoundOneOpinions(roundTwo),
  });
}

export function buildCompressionMessages(
  topic: string,
  workingLanguage: string,
  phaseLabel: string,
  speaker: string,
  output: string,
  promptTemplates: PromptTemplateSet = defaultPromptTemplates,
): ChatMessage[] {
  return renderTemplate(promptTemplates.compression, {
    working_language: workingLanguage,
    topic,
    phase_label: phaseLabel,
    speaker_name: speaker,
    speaker_output: output,
  });
}

export function serializeContext(context: unknown): string {
  if (typeof context === "string") {
    return context;
  }

  return JSON.stringify(context, null, 2);
}

async function handleSpeakerOutput({
  topic,
  workingLanguage,
  phase,
  speaker,
  content,
  modelCalls,
  options,
  promptTemplates,
}: {
  topic: string;
  workingLanguage: string;
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

  const messages = buildCompressionMessages(topic, workingLanguage, phaseLabel, speaker, content, promptTemplates);
  try {
    const compressed = await generateAndLog({
      phase: "compression",
      speaker,
      model: options.compressionModel,
      messages,
      modelCalls,
      generateOptions: { maxOutputTokens: COMPRESSION_MAX_OUTPUT_TOKENS },
    });
    options.onCompressedOutput?.({ phase, phaseLabel, speaker, content: compressed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.onCompressedOutput?.({ phase, phaseLabel, speaker, content: `[compression failed: ${message}]` });
  }
}

async function generateAndLog({
  phase,
  speaker,
  model,
  messages,
  modelCalls,
  generateOptions,
}: {
  phase: ModelCallLog["phase"];
  speaker: string;
  model: ChatModel;
  messages: ChatMessage[];
  modelCalls: ModelCallLog[];
  generateOptions?: Parameters<ChatModel["generate"]>[1];
}): Promise<string> {
  try {
    const response = await model.generate(messages, generateOptions);
    modelCalls.push({
      phase,
      speaker,
      provider: model.provider,
      model: model.model,
      messages,
      response,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    modelCalls.push({
      phase,
      speaker,
      provider: model.provider,
      model: model.model,
      messages,
      response: `[ERROR] ${message}`,
    });
    throw error;
  }
}

function buildSessionResult(
  config: SessionConfig,
  modelCalls: ModelCallLog[],
  roundOne: RoundOutput[],
  roundTwo: RoundOutput[],
  moderatorSummary: string,
  error?: string,
): SessionResult {
  return {
    topic: config.topic,
    context: config.context,
    modelCalls,
    roundOne,
    roundTwo,
    moderatorSummary,
    error,
  };
}

function formatRoundOneOpinions(outputs: RoundOutput[]): string {
  return outputs.map((output) => `<opinion speaker="${output.mindName}">\n${output.mindName} previously said:\n${output.content}\n</opinion>`).join("\n\n");
}

function formatActiveMindNames(minds: Array<Pick<LoadedMind, "name"> | Pick<RoundOutput, "mindName">>): string {
  return minds.map((mind) => ("mindName" in mind ? mind.mindName : mind.name)).join(", ");
}

function formatPhaseLabel(phase: SpeakerOutputPhase): string {
  if (phase === "round-one") {
    return "Round 1";
  }

  if (phase === "round-two") {
    return "Round 2";
  }

  return "Moderator Summary";
}
