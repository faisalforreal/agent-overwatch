import {
  MentorProvider,
  ProviderHealth,
  ProviderRequestOptions,
} from './base.js';
import { UsageStats } from '../types.js';

export class OpenRouterProvider implements MentorProvider {
  public name = 'openrouter';
  public defaultModel = 'anthropic/claude-3-7-sonnet';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://openrouter.ai/api/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async healthCheck(model?: string): Promise<ProviderHealth> {
    const targetModel = model || this.defaultModel;
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/auth/key`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
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

    let progressInterval: NodeJS.Timeout | undefined;
    if (options.onProgress) {
      let tick = 0;
      options.onProgress(5, 100, `Contacting OpenRouter mentor (${targetModel})...`);
      progressInterval = setInterval(() => {
        tick++;
        const pct = Math.min(10 + tick * 10, 95);
        options.onProgress!(pct, 100, `Reasoning in progress... (${tick * 5}s)`);
      }, 5000);
    }

    try {
      const systemText = options.notesContext
        ? `${options.systemPrompt}\n\n### Persistent Project Notes:\n${options.notesContext}`
        : options.systemPrompt;

      const body = {
        model: targetModel,
        max_tokens: options.maxTokens || 4096,
        messages: [
          { role: 'system', content: systemText },
          { role: 'user', content: options.userPrompt },
        ],
      };

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/overwatch/overwatch',
          'X-Title': 'overwatch',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenRouter API Error (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as any;
      const rawText = data.choices?.[0]?.message?.content || '';

      const promptTokens = data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.completion_tokens || 0;
      const totalTokens = data.usage?.total_tokens || promptTokens + completionTokens;

      // Estimate cost based on rough frontier rates ($10/M in, $40/M out)
      const cost =
        (promptTokens / 1_000_000) * 10.0 + (completionTokens / 1_000_000) * 40.0;

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
          `Request to OpenRouter timed out after ${options.timeoutMs || 90000}ms.`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (progressInterval) clearInterval(progressInterval);
    }
  }
}
