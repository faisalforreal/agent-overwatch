import { describe, it, expect } from 'vitest';
import { ProviderRouter } from '../src/providers/router.js';
import { resolveConfig } from '../src/config.js';
import path from 'node:path';
import os from 'node:os';

describe('Provider Base URL Isolation & Non-Interference Suite', () => {
  const dummyCfg = path.join(os.tmpdir(), `dummy-baseurl-${Date.now()}.json`);

  it('passes anthropicBaseUrl to AnthropicProvider without affecting other providers', () => {
    const config = resolveConfig(
      {
        anthropicApiKey: 'sk-ant-test',
        anthropicBaseUrl: 'https://custom-anthropic-proxy.internal',
      },
      dummyCfg
    );
    const router = new ProviderRouter(config);
    const route = router.resolveProviderForModel('claude-3-opus-20240229');

    expect(route.provider.name).toBe('anthropic');
    expect((route.provider as any).baseUrl).toBe('https://custom-anthropic-proxy.internal');
  });

  it('passes geminiBaseUrl to GeminiProvider without affecting other providers', () => {
    const config = resolveConfig(
      {
        geminiApiKey: 'gemini-test-key',
        geminiBaseUrl: 'https://custom-gemini-proxy.internal',
      },
      dummyCfg
    );
    const router = new ProviderRouter(config);
    const route = router.resolveProviderForModel('gemini-2.0-flash');

    expect(route.provider.name).toBe('gemini');
    expect((route.provider as any).baseUrl).toBe('https://custom-gemini-proxy.internal');
  });

  it('passes openrouterBaseUrl to OpenRouterProvider', () => {
    const config = resolveConfig(
      {
        openrouterApiKey: 'sk-or-test',
        openrouterBaseUrl: 'https://openrouter-mirror.internal/v1',
      },
      dummyCfg
    );
    const router = new ProviderRouter(config);
    const route = router.resolveProviderForModel('meta-llama/llama-3-70b');

    expect(route.provider.name).toBe('openrouter');
    expect((route.provider as any).baseUrl).toBe('https://openrouter-mirror.internal/v1');
  });

  it('ensures customBaseUrl does NOT hijack Bedrock or Anthropic models', () => {
    const config = resolveConfig(
      {
        customBaseUrl: 'http://localhost:11434/v1',
        bedrockApiKey: 'bedrock-key',
        awsRegion: 'us-east-1',
      },
      dummyCfg
    );
    const router = new ProviderRouter(config);

    // Bedrock model must route to Bedrock, NOT custom
    const bedrockRoute = router.resolveProviderForModel('anthropic.claude-3-5-sonnet-20241022-v2:0');
    expect(bedrockRoute.provider.name).toBe('bedrock');

    // Custom model must route to custom
    const customRoute = router.resolveProviderForModel('custom/deepseek-coder');
    expect(customRoute.provider.name).toBe('custom');
  });

  it('ensures openaiBaseUrl does NOT hijack Claude models', () => {
    const config = resolveConfig(
      {
        openaiBaseUrl: 'http://localhost:8080/v1',
        anthropicApiKey: 'sk-ant-test',
      },
      dummyCfg
    );
    const router = new ProviderRouter(config);
    const route = router.resolveProviderForModel('claude-3-5-sonnet');

    expect(route.provider.name).toBe('anthropic');
  });
});
