import {
  MentorProvider,
  ProviderHealth,
  ProviderRequestOptions,
} from './base.js';
import { UsageStats } from '../types.js';

export class GeminiProvider implements MentorProvider {
  public name = 'gemini';
  public defaultModel = 'gemini-4-argon';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://generativelanguage.googleapis.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async healthCheck(model?: string): Promise<ProviderHealth> {
    const targetModel = model || this.defaultModel;
    const start = Date.now();
    try {
      const url = `${this.baseUrl}/v1beta/models/${targetModel}?key=${this.apiKey}`;
      const res = await fetch(url, { method: 'GET' });

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
      options.onProgress(5, 100, `Contacting Gemini mentor (${targetModel})...`);
      progressInterval = setInterval(() => {
        tick++;
        const pct = Math.min(10 + tick * 10, 95);
        options.onProgress!(pct, 100, `Reasoning in progress... (${tick * 5}s)`);
      }, 5000);
    }

    try {
      const url = `${this.baseUrl}/v1beta/models/${targetModel}:generateContent?key=${this.apiKey}`;

      const systemText = options.notesContext
        ? `${options.systemPrompt}\n\n### Persistent Project Notes:\n${options.notesContext}`
        : options.systemPrompt;

      const body = {
        systemInstruction: {
          parts: [{ text: systemText }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: options.userPrompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: options.maxTokens || 4096,
          responseMimeType: 'application/json',
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gemini API Error (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as any;
      let rawText = '';
      const candidate = data.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) rawText += part.text;
        }
      }

      const promptTokens = data.usageMetadata?.promptTokenCount || 0;
      const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = data.usageMetadata?.totalTokenCount || promptTokens + completionTokens;

      // Approximate cost calculation ($2.50/M in, $10.00/M out for Gemini Argon/Pro)
      const cost =
        (promptTokens / 1_000_000) * 2.5 + (completionTokens / 1_000_000) * 10.0;

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
          `Request to Gemini timed out after ${options.timeoutMs || 90000}ms.`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (progressInterval) clearInterval(progressInterval);
    }
  }
}
