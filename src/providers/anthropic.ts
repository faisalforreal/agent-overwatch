import {
  MentorProvider,
  ProviderHealth,
  ProviderRequestOptions,
} from './base.js';
import { UsageStats } from '../types.js';

export class AnthropicProvider implements MentorProvider {
  public name = 'anthropic';
  public defaultModel = 'claude-opus-5';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.anthropic.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async healthCheck(model?: string): Promise<ProviderHealth> {
    const targetModel = model || this.defaultModel;
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: targetModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const errorText = await res.text();
        return {
          ok: false,
          provider: this.name,
          model: targetModel,
          latencyMs,
          error: `HTTP ${res.status}: ${errorText}`,
        };
      }
      return {
        ok: true,
        provider: this.name,
        model: targetModel,
        latencyMs,
      };
    } catch (err: any) {
      return {
        ok: false,
        provider: this.name,
        model: targetModel,
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
      };
    }
  }

  async generate(
    options: ProviderRequestOptions
  ): Promise<{ rawText: string; usage: UsageStats }> {
    const targetModel = options.model || this.defaultModel;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs || 90000);

    // Keep-alive progress ticker
    let progressInterval: NodeJS.Timeout | undefined;
    if (options.onProgress) {
      let tick = 0;
      options.onProgress(5, 100, `Contacting Anthropic mentor (${targetModel})...`);
      progressInterval = setInterval(() => {
        tick++;
        const pct = Math.min(10 + tick * 10, 95);
        options.onProgress!(pct, 100, `Reasoning in progress... (${tick * 5}s)`);
      }, 5000);
    }

    try {
      // Build system prompt with optional prompt caching
      const systemContent: any[] = [];
      if (options.enablePromptCaching) {
        systemContent.push({
          type: 'text',
          text: options.systemPrompt,
          cache_control: { type: 'ephemeral' },
        });
        if (options.notesContext) {
          systemContent.push({
            type: 'text',
            text: `\n### Persistent Project Notes:\n${options.notesContext}`,
            cache_control: { type: 'ephemeral' },
          });
        }
      } else {
        systemContent.push({
          type: 'text',
          text: options.notesContext
            ? `${options.systemPrompt}\n\n### Persistent Project Notes:\n${options.notesContext}`
            : options.systemPrompt,
        });
      }

      const body: Record<string, any> = {
        model: targetModel,
        max_tokens: options.maxTokens || 4096,
        system: systemContent,
        messages: [{ role: 'user', content: options.userPrompt }],
      };

      if (
        options.enableThinking &&
        !options.fastMode &&
        /sonnet|opus|reason/i.test(targetModel)
      ) {
        const budget = options.thinkingBudgetTokens || 2048;
        body.thinking = { type: 'enabled', budget_tokens: budget };
        if (body.max_tokens < budget + 1024) body.max_tokens = budget + 1024;
      }

      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-25',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Anthropic API Error (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as any;
      let rawText = '';
      if (Array.isArray(data.content)) {
        for (const block of data.content) {
          if (block.type === 'text') {
            rawText += block.text;
          }
        }
      }

      const promptTokens = data.usage?.input_tokens || 0;
      const completionTokens = data.usage?.output_tokens || 0;
      const totalTokens = promptTokens + completionTokens;

      // Approximate cost calculation ($15/M input, $75/M output for Opus)
      const cost =
        (promptTokens / 1_000_000) * 15.0 + (completionTokens / 1_000_000) * 75.0;

      return {
        rawText,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          estimated_cost_usd: cost,
        },
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(
          `Request to Anthropic timed out after ${options.timeoutMs || 90000}ms.`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (progressInterval) clearInterval(progressInterval);
    }
  }
}
