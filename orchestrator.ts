import type { SessionConfig } from "./config";
import type { LoadedMind } from "./personas";
import type { ChatMessage, ChatModel } from "./models/types";
import { defaultPromptTemplates, renderTemplate, type PromptTemplateSet } from "./prompt-templates";

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
}

export interface ModelCallLog {
  phase: "round-one" | "round-two" | "moderator-summary";
  speaker: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  response: string;
}

export interface RunOptions {
  moderatorModel: ChatModel;
  promptTemplates?: PromptTemplateSet;
  onProgress?: (message: string) => void;
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

  for (const mind of minds) {
    options.onProgress?.(`Round 1: ${mind.name}`);
    const messages = buildRoundOneMessages(config.topic, context, workingLanguage, mind, minds, promptTemplates);
    const content = await mind.model.generate(messages);
    modelCalls.push({
      phase: "round-one",
      speaker: mind.name,
      provider: mind.model.provider,
      model: mind.model.model,
      messages,
      response: content,
    });
    roundOne.push({ mindId: mind.id, mindName: mind.name, content });
  }

  for (const mind of minds) {
    options.onProgress?.(`Round 2: ${mind.name}`);
    const messages = buildRoundTwoMessages(config.topic, context, workingLanguage, mind, roundOne, promptTemplates);
    const content = await mind.model.generate(messages);
    modelCalls.push({
      phase: "round-two",
      speaker: mind.name,
      provider: mind.model.provider,
      model: mind.model.model,
      messages,
      response: content,
    });
    roundTwo.push({ mindId: mind.id, mindName: mind.name, content });
  }

  options.onProgress?.("Moderator summary");
  const moderatorMessages = buildModeratorMessages(config.topic, context, workingLanguage, roundOne, roundTwo, promptTemplates);
  const moderatorSummary = await options.moderatorModel.generate(
    moderatorMessages,
    { maxOutputTokens: 1800 },
  );
  modelCalls.push({
    phase: "moderator-summary",
    speaker: "Moderator",
    provider: options.moderatorModel.provider,
    model: options.moderatorModel.model,
    messages: moderatorMessages,
    response: moderatorSummary,
  });

  return {
    topic: config.topic,
    context: config.context,
    modelCalls,
    roundOne,
    roundTwo,
    moderatorSummary,
  };
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

export function serializeContext(context: unknown): string {
  if (typeof context === "string") {
    return context;
  }

  return JSON.stringify(context, null, 2);
}

function formatRoundOneOpinions(outputs: RoundOutput[]): string {
  return outputs.map((output) => `<opinion speaker="${output.mindName}">\n${output.mindName} previously said:\n${output.content}\n</opinion>`).join("\n\n");
}

function formatActiveMindNames(minds: Array<Pick<LoadedMind, "name"> | Pick<RoundOutput, "mindName">>): string {
  return minds.map((mind) => ("mindName" in mind ? mind.mindName : mind.name)).join(", ");
}
