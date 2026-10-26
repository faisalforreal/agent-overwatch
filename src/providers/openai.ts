import {
  MentorProvider,
  ProviderHealth,
  ProviderRequestOptions,
} from './base.js';
import { UsageStats } from '../types.js';

export class OpenAIProvider implements MentorProvider {
  public name = 'openai';
  public defaultModel = 'o3-mini';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.openai.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async healthCheck(model?: string): Promise<ProviderHealth> {
    const targetModel = model || this.defaultModel;
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
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
    const isReasoningModel = /^(o1|o3)/i.test(targetModel);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs || 90000);

    let progressInterval: NodeJS.Timeout | undefined;
    if (options.onProgress) {
      let tick = 0;
      options.onProgress(5, 100, `Contacting OpenAI mentor (${targetModel})...`);
      progressInterval = setInterval(() => {
        tick++;
        const pct = Math.min(10 + tick * 10, 95);
        options.onProgress!(pct, 100, `Reasoning in progress... (${tick * 5}s)`);
      }, 5000);
    }

    try {
      const messages: any[] = [];
      const systemText = options.notesContext
        ? `${options.systemPrompt}\n\n### Persistent Project Notes:\n${options.notesContext}`
        : options.systemPrompt;

      if (isReasoningModel) {
        // o1/o3 support developer message or direct system instruction
        messages.push({ role: 'developer', content: systemText });
      } else {
        messages.push({ role: 'system', content: systemText });
      }

      messages.push({ role: 'user', content: options.userPrompt });

      const body: Record<string, any> = {
        model: targetModel,
        messages,
      };

      if (isReasoningModel) {
        body.max_completion_tokens = options.maxTokens || 4096;
      } else {
        body.max_tokens = options.maxTokens || 4096;
      }

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenAI API Error (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as any;
      const rawText = data.choices?.[0]?.message?.content || '';

      const promptTokens = data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.completion_tokens || 0;
      const totalTokens = data.usage?.total_tokens || promptTokens + completionTokens;

      // Approximate cost for o3-mini ($1.10/M in, $4.40/M out) or o1 ($15/M in, $60/M out)
      const costPerMillionIn = isReasoningModel ? 5.0 : 2.5;
      const costPerMillionOut = isReasoningModel ? 20.0 : 10.0;
      const cost =
        (promptTokens / 1_000_000) * costPerMillionIn +
        (completionTokens / 1_000_000) * costPerMillionOut;

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
          `Request to OpenAI timed out after ${options.timeoutMs || 90000}ms.`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (progressInterval) clearInterval(progressInterval);
    }
  }
}
