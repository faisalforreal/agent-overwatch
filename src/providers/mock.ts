import {
  MentorProvider,
  ProviderHealth,
  ProviderRequestOptions,
} from './base.js';
import { OverwatchFeedback, UsageStats } from '../types.js';

export class MockProvider implements MentorProvider {
  public name = 'mock';
  public defaultModel = 'mock-frontier-mentor';
  public customResponse?: OverwatchFeedback;
  public shouldFail = false;
  public failureMessage = 'Mock provider simulated failure';
  public latencyMs = 25;

  constructor(options?: {
    customResponse?: OverwatchFeedback;
    shouldFail?: boolean;
    failureMessage?: string;
  }) {
    if (options?.customResponse) this.customResponse = options.customResponse;
    if (options?.shouldFail !== undefined) this.shouldFail = options.shouldFail;
    if (options?.failureMessage) this.failureMessage = options.failureMessage;
  }

  async healthCheck(model?: string): Promise<ProviderHealth> {
    if (this.shouldFail) {
      return {
        ok: false,
        provider: this.name,
        model: model || this.defaultModel,
        error: this.failureMessage,
      };
    }
    return {
      ok: true,
      provider: this.name,
      model: model || this.defaultModel,
      latencyMs: this.latencyMs,
    };
  }

  async generate(
    options: ProviderRequestOptions
  ): Promise<{ rawText: string; usage: UsageStats }> {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }

    if (options.onProgress) {
      options.onProgress(50, 100, 'Analyzing codebase architecture...');
      options.onProgress(100, 100, 'Formulating structured critique...');
    }

    const feedback: OverwatchFeedback = this.customResponse || {
      verdict: 'APPROVED',
      summary: 'Architectural plan satisfies all requirements and handles edge cases cleanly.',
      defects: [],
      optimizations: [
        {
          type: 'performance',
          description: 'Leverage streaming reader for large file payloads',
          impact: 'Reduces peak RAM by 40%',
        },
      ],
      next_steps: [
        'Proceed with file modifications in src/server.ts',
        'Add unit tests covering edge cases in tests/',
      ],
      avoid: ['Do not mutate global process environment variables directly'],
      coaching_prompt: 'Execute the planned changes and run test suite.',
      notes_to_save: ['Decided to use streamable buffer for large payloads'],
    };

    const usage: UsageStats = {
      prompt_tokens: 450,
      completion_tokens: 180,
      total_tokens: 630,
      estimated_cost_usd: 0.005,
    };

    return {
      rawText: JSON.stringify(feedback, null, 2),
      usage,
    };
  }
}
