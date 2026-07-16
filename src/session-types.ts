import type { ChatMessage, ChatModel } from "./models/types";
import type { LoadedMind } from "./personas";
import type { PromptTemplateSet } from "./prompt-templates";

export interface RoundOutput {
  mindId: string;
  mindName: string;
  content: string;
}

export type UrgencyLevel = "no_new_comment" | "minor_update" | "strong_need_to_respond";
export type DynamicSelectionMethod = "urgency" | "invitation";
export type DynamicModeratorAction = "continue" | "summarize" | "end_discussion";

export interface UrgencySignal {
  mindId: string;
  mindName: string;
  urgency: UrgencyLevel;
}

export interface UrgencyPoll {
  afterTurnNumber: number;
  signals: UrgencySignal[];
  selectedMindId?: string;
}

export interface DynamicTurn {
  turnNumber: number;
  mindId: string;
  mindName: string;
  content: string;
  selectionMethod: DynamicSelectionMethod;
  selectedUrgency?: UrgencyLevel;
  invitedByMindId?: string;
  inviteMindId: string | null;
}

export interface DynamicModeratorCheck {
  afterTurnNumber: number;
  turnsSinceCheckpoint: number;
  action: DynamicModeratorAction;
  checkpointSummary: string;
  progressAssessment: string;
  endReason: string;
}

export interface DynamicSpeakerResponse {
  content: string;
  inviteMindId: string | null;
}

export interface RoundResult {
  roundNumber: number;
  outputs: RoundOutput[];
}

export type ModeratorDecision = "continue" | "end_discussion";

export interface ModeratorReview {
  roundNumber: number;
  roundSummary: string;
  progressAssessment: string;
  decision: ModeratorDecision;
  endReason: string;
}

export type SpeakerOutputPhase =
  | `round-${number}`
  | `moderator-review-${number}`
  | `dynamic-turn-${number}`
  | `moderator-check-${number}`
  | "final-summary";
export type ModelCallPhase = SpeakerOutputPhase | `urgency-after-turn-${number}` | "compression";

export interface ModelCallLog {
  phase: ModelCallPhase;
  speaker: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  response: string;
  attempt?: number;
  successful?: boolean;
  validationError?: string;
}

export interface SessionResult {
  topic: string;
  context: unknown;
  discussionMode: "simple" | "dynamic";
  modelCalls: ModelCallLog[];
  rounds: RoundResult[];
  moderatorReviews: ModeratorReview[];
  effectiveMaxTurns?: number;
  dynamicTurns: DynamicTurn[];
  urgencyPolls: UrgencyPoll[];
  dynamicModeratorChecks: DynamicModeratorCheck[];
  finalSummary?: string;
  stopReason?: string;
  error?: string;
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
  urgencyModel?: ChatModel;
  promptTemplates?: PromptTemplateSet;
  onProgress?: (message: string) => void;
  onCompressedOutput?: (output: CompressedOutput) => void;
  onSpeakerOutput?: (output: SpeakerOutput) => void;
  onSessionUpdate?: (result: SessionResult) => void | Promise<void>;
}

export interface NextSpeakerSelection {
  mind: LoadedMind;
  method: DynamicSelectionMethod;
  selectedUrgency?: UrgencyLevel;
  invitedByMindId?: string;
}

export interface DynamicSessionState {
  effectiveMaxTurns: number;
  dynamicTurns: DynamicTurn[];
  urgencyPolls: UrgencyPoll[];
  dynamicModeratorChecks: DynamicModeratorCheck[];
}

export interface DiscussionHistoryState {
  rounds: RoundResult[];
  moderatorReviews: ModeratorReview[];
  dynamicTurns?: DynamicTurn[];
  urgencyPolls?: UrgencyPoll[];
  dynamicModeratorChecks?: DynamicModeratorCheck[];
}
