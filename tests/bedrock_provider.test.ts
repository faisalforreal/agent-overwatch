import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BedrockProvider } from '../src/providers/bedrock.js';

describe('BedrockProvider Test Suite', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('correctly formats and dispatches Bedrock Converse request with apiKey', async () => {
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
          output: {
            message: {
              role: 'assistant',
              content: [{ text: '{"verdict":"APPROVED","summary":"Bedrock verified."}' }],
            },
          },
          usage: { inputTokens: 210, outputTokens: 85, totalTokens: 295 },
        }),
      } as any;
    });

    const provider = new BedrockProvider({
      apiKey: 'bedrock-api-key-test',
      region: 'us-west-2',
      defaultModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    });

    const res = await provider.generate({
      systemPrompt: 'System instructions',
      userPrompt: 'Check this task',
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    });

    expect(capturedUrl).toContain('bedrock-runtime.us-west-2.amazonaws.com/model/anthropic.claude-3-5-sonnet-20241022-v2%3A0/converse');
    expect(capturedHeaders['Authorization']).toBe('Bearer bedrock-api-key-test');
    expect(capturedHeaders['x-api-key']).toBe('bedrock-api-key-test');
    expect(capturedBody.messages[0].content[0].text).toBe('Check this task');
    expect(res.rawText).toContain('APPROVED');
    expect(res.usage.total_tokens).toBe(295);
  });

  it('generates AWS SigV4 authorization headers when AWS credentials are provided', async () => {
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      capturedHeaders = init.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output: {
            message: {
              role: 'assistant',
              content: [{ text: '{"verdict":"APPROVED","summary":"SigV4 worked."}' }],
            },
          },
          usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
        }),
      } as any;
    });

    const provider = new BedrockProvider({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      sessionToken: 'test-session-token',
      region: 'us-east-1',
    });

    await provider.generate({
      systemPrompt: 'Sys',
      userPrompt: 'User',
      model: 'amazon.nova-pro-v1:0',
    });

    expect(capturedHeaders['Authorization']).toContain('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/');
    expect(capturedHeaders['x-amz-security-token']).toBe('test-session-token');
    expect(capturedHeaders['x-amz-date']).toBeDefined();
  });
});
