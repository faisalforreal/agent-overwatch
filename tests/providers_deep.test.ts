import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../src/providers/anthropic.js';
import { OpenAIProvider } from '../src/providers/openai.js';
import { GeminiProvider } from '../src/providers/gemini.js';
import { OpenRouterProvider } from '../src/providers/openrouter.js';
import { ProviderRouter } from '../src/providers/router.js';
import { resolveConfig } from '../src/config.js';

describe('Deep Native Providers Test Suite', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. Anthropic Provider Deep Tests
  describe('AnthropicProvider', () => {
    it('sends prompt caching headers and cache_control blocks when enabled', async () => {
      let capturedRequest: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
        capturedRequest = { url, ...init, body: JSON.parse(init.body) };
        return {
          ok: true,
          json: async () => ({
            content: [{ type: 'text', text: '{"verdict":"APPROVED","summary":"Clean"}' }],
            usage: { input_tokens: 120, output_tokens: 45 },
          }),
        };
      });

      const provider = new AnthropicProvider('sk-ant-test-key');
      const progressCalls: any[] = [];

      const res = await provider.generate({
        systemPrompt: 'System instructions',
        userPrompt: 'Review this diff',
        notesContext: 'Notes memory',
        model: 'claude-opus-5',
        enablePromptCaching: true,
        enableThinking: true,
        onProgress: (p, total, msg) => progressCalls.push({ p, msg }),
      });

      expect(capturedRequest.headers['x-api-key']).toBe('sk-ant-test-key');
      expect(capturedRequest.headers['anthropic-beta']).toContain('prompt-caching');
      expect(capturedRequest.body.system[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(capturedRequest.body.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 });

      expect(res.usage.prompt_tokens).toBe(120);
      expect(res.usage.completion_tokens).toBe(45);
      expect(res.usage.estimated_cost_usd).toBeGreaterThan(0);
      expect(progressCalls.length).toBeGreaterThan(0);
    });

    it('handles HTTP 429 rate limit error gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded: 50 requests per minute',
      });

      const provider = new AnthropicProvider('sk-ant-test-key');
      await expect(
        provider.generate({
          systemPrompt: 'test',
          userPrompt: 'test',
          model: 'claude-opus-5',
        })
      ).rejects.toThrow('Anthropic API Error (429): Rate limit exceeded');
    });

    it('handles request timeout using AbortController', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err: any = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const provider = new AnthropicProvider('sk-ant-test-key');
      await expect(
        provider.generate({
          systemPrompt: 'test',
          userPrompt: 'test',
          model: 'claude-opus-5',
          timeoutMs: 50, // Short 50ms timeout
        })
      ).rejects.toThrow('timed out after 50ms');
    });
  });

  // 2. OpenAI Provider Deep Tests
  describe('OpenAIProvider', () => {
    it('formats reasoning models (o1/o3) with developer role and max_completion_tokens', async () => {
      let capturedRequest: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
        capturedRequest = { url, ...init, body: JSON.parse(init.body) };
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"verdict":"APPROVED","summary":"Reasoning solid"}' } }],
            usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
          }),
        };
      });

      const provider = new OpenAIProvider('sk-openai-key');
      const res = await provider.generate({
        systemPrompt: 'System arch',
        userPrompt: 'Evaluate o3 reasoning',
        model: 'o3-mini',
        maxTokens: 3000,
      });

      expect(capturedRequest.body.model).toBe('o3-mini');
      expect(capturedRequest.body.messages[0].role).toBe('developer');
      expect(capturedRequest.body.max_completion_tokens).toBe(3000);
      expect(capturedRequest.body.max_tokens).toBeUndefined();
      expect(res.usage.total_tokens).toBe(300);
    });

    it('formats standard models (gpt-4o) with system role and max_tokens', async () => {
      let capturedRequest: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
        capturedRequest = { url, ...init, body: JSON.parse(init.body) };
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"verdict":"APPROVED"}' } }],
            usage: { prompt_tokens: 150, completion_tokens: 50 },
          }),
        };
      });

      const provider = new OpenAIProvider('sk-openai-key');
      await provider.generate({
        systemPrompt: 'System',
        userPrompt: 'User',
        model: 'gpt-4o',
      });

      expect(capturedRequest.body.messages[0].role).toBe('system');
      expect(capturedRequest.body.max_tokens).toBeDefined();
    });

    it('supports custom base URLs for Ollama or vLLM', async () => {
      let requestedUrl = '';
      globalThis.fetch = vi.fn().mockImplementation(async (url) => {
        requestedUrl = String(url);
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"verdict":"APPROVED"}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 10 },
          }),
        };
      });

      const provider = new OpenAIProvider('ollama', 'http://localhost:11434/v1');
      await provider.generate({
        systemPrompt: 'sys',
        userPrompt: 'usr',
        model: 'qwen2.5-coder:32b',
      });

      expect(requestedUrl).toBe('http://localhost:11434/v1/chat/completions');
    });
  });

  // 3. Gemini Provider Deep Tests
  describe('GeminiProvider', () => {
    it('correctly constructs systemInstruction, contents, and JSON mimeType', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: '{"verdict":"APPROVED","summary":"Argon evaluated"}' }],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 150 },
          }),
        };
      });

      const provider = new GeminiProvider('AIzaSyFakeGeminiKey');
      const res = await provider.generate({
        systemPrompt: 'Gemini system',
        userPrompt: 'Review Argon plan',
        model: 'gemini-4-argon',
      });

      expect(capturedUrl).toContain('gemini-4-argon:generateContent?key=AIzaSyFakeGeminiKey');
      expect(capturedBody.systemInstruction.parts[0].text).toContain('Gemini system');
      expect(capturedBody.generationConfig.responseMimeType).toBe('application/json');
      expect(res.usage.prompt_tokens).toBe(500);
      expect(res.usage.completion_tokens).toBe(150);
    });

    it('handles Gemini API error response (503 Service Unavailable)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service overloaded. Please retry with exponential backoff.',
      });

      const provider = new GeminiProvider('AIzaSyKey');
      await expect(
        provider.generate({
          systemPrompt: 'test',
          userPrompt: 'test',
          model: 'gemini-4-argon',
        })
      ).rejects.toThrow('Gemini API Error (503)');
    });
  });

  // 4. OpenRouter Provider Deep Tests
  describe('OpenRouterProvider', () => {
    it('sets HTTP-Referer and X-Title headers correctly', async () => {
      let headers: any = null;
      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        headers = init.headers;
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '{"verdict":"APPROVED"}' } }],
            usage: { prompt_tokens: 300, completion_tokens: 80 },
          }),
        };
      });

      const provider = new OpenRouterProvider('sk-or-test-key');
      await provider.generate({
        systemPrompt: 'sys',
        userPrompt: 'usr',
        model: 'anthropic/claude-3-7-sonnet',
      });

      expect(headers['Authorization']).toBe('Bearer sk-or-test-key');
      expect(headers['HTTP-Referer']).toBe('https://github.com/overwatch/overwatch');
      expect(headers['X-Title']).toBe('overwatch');
    });
  });

  // 5. Fallback Ladder Integration Test
  describe('ProviderRouter Fallback Ladder', () => {
    it('automatically catches 429 rate limit on primary and falls back to secondary model', async () => {
      let callCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
        callCount++;
        const body = JSON.parse(init.body);
        if (body.model === 'primary-model') {
          return {
            ok: false,
            status: 429,
            text: async () => 'Primary model quota exceeded',
          };
        }
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    verdict: 'APPROVED',
                    summary: 'Fallback succeeded',
                    defects: [],
                    optimizations: [],
                    next_steps: ['Continue'],
                    avoid: [],
                    coaching_prompt: 'Proceed with task',
                    notes_to_save: [],
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
        };
      });

      const config = resolveConfig();
      config.openrouterApiKey = 'sk-or-key';
      config.mentorModel = 'primary-model';
      config.mentorFallbacks = [{ provider: 'openrouter', model: 'secondary-model' }];

      const router = new ProviderRouter(config);
      const res = await router.executeReviewWithFallbacks({
        systemPrompt: 'sys',
        userPrompt: 'usr',
      });

      expect(res.verdict).toBe('APPROVED');
      expect(res.summary).toContain('Fallback succeeded');
      expect(callCount).toBe(2);
    });
  });
});
