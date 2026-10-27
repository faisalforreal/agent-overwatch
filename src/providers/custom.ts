import {
  MentorProvider,
  ProviderHealth,
  ProviderRequestOptions,
} from './base.js';
import { UsageStats } from '../types.js';
import { DEFAULT_TIMEOUT_MS } from '../constants.js';
import { estimateModelCost } from '../tiers.js';

export interface CustomProviderOptions {
  apiKey?: string;
  baseUrl: string;
  defaultModel?: string;
  customHeaders?: Record<string, string>;
  name?: string;
}

export class CustomProvider implements MentorProvider {
  public name: string;
  public defaultModel: string;
  private apiKey?: string;
  private baseUrl: string;
  private customHeaders: Record<string, string>;

  constructor(options: CustomProviderOptions) {
    this.name = options.name || 'custom';
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.defaultModel = options.defaultModel || 'custom-mentor';
    this.customHeaders = options.customHeaders || {};
  }

  private getChatCompletionsUrl(): string {
    if (this.baseUrl.endsWith('/chat/completions')) {
      return this.baseUrl;
    }
    return `${this.baseUrl}/chat/completions`;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.customHeaders,
    };
    if (this.apiKey && !headers['Authorization'] && !headers['authorization']) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async healthCheck(model?: string): Promise<ProviderHealth> {
    const targetModel = model || this.defaultModel;
    const start = Date.now();
    try {
      // 1. Try GET /models if not pointing directly to /chat/completions
      let pingUrl = `${this.baseUrl}/models`;
      let res = await fetch(pingUrl, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      // 2. If /models is 404 or unsupported (common in some local runners), try pinging base URL
      if (res.status === 404 || res.status === 405) {
        res = await fetch(this.baseUrl, {
          method: 'GET',
          headers: this.buildHeaders(),
        });
      }

      const latencyMs = Date.now() - start;
      if (!res.ok && res.status !== 200 && res.status !== 204) {
        const errorText = await res.text().catch(() => '');
        return {
          ok: false,
          provider: this.name,
          model: targetModel,
          latencyMs,
          error: `HTTP ${res.status}: ${errorText.slice(0, 200)}`,
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
    const timeout = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    let progressInterval: NodeJS.Timeout | undefined;
    if (options.onProgress) {
      let tick = 0;
      options.onProgress(5, 100, `Contacting custom endpoint mentor (${targetModel})...`);
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

      const messages: any[] = [
        { role: 'system', content: systemText },
        { role: 'user', content: options.userPrompt },
      ];

      const body: Record<string, any> = {
        model: targetModel,
        messages,
        max_tokens: options.maxTokens || 4096,
      };

      const res = await fetch(this.getChatCompletionsUrl(), {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Custom Provider API Error (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as any;
      const rawText = data.choices?.[0]?.message?.content || '';

      const promptTokens = data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.completion_tokens || 0;
      const totalTokens = data.usage?.total_tokens || promptTokens + completionTokens;

      const cost = estimateModelCost(targetModel, promptTokens, completionTokens);

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
        throw new Error(`Request to custom provider timed out after ${timeout}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (progressInterval) clearInterval(progressInterval);
    }
  }
}
