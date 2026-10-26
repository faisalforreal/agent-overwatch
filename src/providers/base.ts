import { OverwatchFeedback, UsageStats } from '../types.js';

export interface ProgressCallback {
  (progress: number, total?: number, message?: string): void;
}

export interface ProviderRequestOptions {
  systemPrompt: string;
  userPrompt: string;
  notesContext?: string;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
  enableThinking?: boolean;
  enablePromptCaching?: boolean;
  onProgress?: ProgressCallback;
}

export interface ProviderHealth {
  ok: boolean;
  provider: string;
  model: string;
  latencyMs?: number;
  error?: string;
}

export interface MentorProvider {
  name: string;
  defaultModel: string;
  healthCheck(model?: string): Promise<ProviderHealth>;
  generate(options: ProviderRequestOptions): Promise<{ rawText: string; usage: UsageStats }>;
}
