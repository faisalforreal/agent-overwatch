import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CustomProvider } from '../src/providers/custom.js';

describe('CustomProvider Test Suite', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('correctly dispatches chat completion requests with custom headers and baseUrl', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      capturedUrl = url;
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"verdict":"APPROVED","summary":"Looks solid."}' } }],
          usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
        }),
      } as any;
    });

    const provider = new CustomProvider({
      baseUrl: 'https://custom.internal-ai.org/v1',
      apiKey: 'test-secret-token',
      defaultModel: 'deepseek-r1-custom',
      customHeaders: {
        'X-Enterprise-Client': 'Overwatch-Dev',
      },
    });

    const res = await provider.generate({
      systemPrompt: 'System instructions',
      userPrompt: 'Review this diff',
      model: 'deepseek-r1-custom',
    });

    expect(capturedUrl).toBe('https://custom.internal-ai.org/v1/chat/completions');
    expect(capturedHeaders['Authorization']).toBe('Bearer test-secret-token');
    expect(capturedHeaders['X-Enterprise-Client']).toBe('Overwatch-Dev');
    expect(capturedBody.model).toBe('deepseek-r1-custom');
    expect(res.rawText).toContain('APPROVED');
    expect(res.usage.total_tokens).toBe(165);
  });

  it('performs health check on /models endpoint', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/models')) {
        return { ok: true, status: 200 } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const provider = new CustomProvider({
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'llama3.3:70b',
    });

    const health = await provider.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.provider).toBe('custom');
    expect(health.model).toBe('llama3.3:70b');
  });
});
