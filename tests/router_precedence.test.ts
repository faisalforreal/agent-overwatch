import { describe, it, expect } from 'vitest';
import { ProviderRouter } from '../src/providers/router.js';
import { resolveConfig } from '../src/config.js';
import path from 'node:path';
import os from 'node:os';

describe('Multi-Key Determinism & Explicit Mentor Provider Suite', () => {
  const dummyCfg = path.join(os.tmpdir(), `dummy-precedence-${Date.now()}.json`);

  it('routes to Bedrock when both Anthropic and Bedrock keys exist if mentorProvider is bedrock', () => {
    const config = resolveConfig(
      {
        anthropicApiKey: 'sk-ant-test',
        bedrockApiKey: 'bedrock-test-key',
        awsRegion: 'us-east-1',
        mentorProvider: 'bedrock',
        mentorModel: 'claude-3-7-sonnet',
      },
      dummyCfg
    );
    const router = new ProviderRouter(config);
    const route = router.resolveProviderForModel('claude-3-7-sonnet');

    expect(route.provider.name).toBe('bedrock');
    expect(route.model).toBe('anthropic.claude-3-7-sonnet-20250219-v1:0');
  });

  it('routes to Anthropic when both Anthropic and Bedrock keys exist if mentorProvider is anthropic', () => {
    const config = resolveConfig(
      {
        anthropicApiKey: 'sk-ant-test',
        bedrockApiKey: 'bedrock-test-key',
        awsRegion: 'us-east-1',
        mentorProvider: 'anthropic',
        mentorModel: 'claude-3-7-sonnet',
      },
      dummyCfg
    );
    const router = new ProviderRouter(config);
    const route = router.resolveProviderForModel('claude-3-7-sonnet');

    expect(route.provider.name).toBe('anthropic');
    expect(route.model).toBe('claude-3-7-sonnet');
  });

  it('routes to OpenRouter when OpenRouter and Gemini keys exist if mentorProvider is openrouter', () => {
    const config = resolveConfig(
      {
        geminiApiKey: 'gemini-key',
        openrouterApiKey: 'sk-or-key',
        mentorProvider: 'openrouter',
        mentorModel: 'gemini-2.0-flash',
      },
      dummyCfg
    );
    const router = new ProviderRouter(config);
    const route = router.resolveProviderForModel('gemini-2.0-flash');

    expect(route.provider.name).toBe('openrouter');
    expect(route.model).toBe('google/gemini-2.0-flash');
  });

  it('honors explicit model prefixes over default provider heuristics', () => {
    const config = resolveConfig(
      {
        anthropicApiKey: 'sk-ant-test',
        bedrockApiKey: 'bedrock-test-key',
        awsRegion: 'us-east-1',
        openrouterApiKey: 'sk-or-test',
      },
      dummyCfg
    );
    const router = new ProviderRouter(config);

    // bedrock/ prefix forces Bedrock
    const routeBedrock = router.resolveProviderForModel('bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0');
    expect(routeBedrock.provider.name).toBe('bedrock');

    // openrouter/ prefix forces OpenRouter
    const routeOpenRouter = router.resolveProviderForModel('openrouter/meta-llama/llama-3-70b');
    expect(routeOpenRouter.provider.name).toBe('openrouter');
    expect(routeOpenRouter.model).toBe('meta-llama/llama-3-70b');
  });

  it('correctly maps Claude 3.7 Sonnet on Bedrock without downgrading to 3.5', () => {
    const config = resolveConfig(
      {
        bedrockApiKey: 'bedrock-test-key',
        awsRegion: 'us-east-1',
      },
      dummyCfg
    );
    const router = new ProviderRouter(config);
    const route = router.resolveProviderForModel('claude-3-7-sonnet');

    expect(route.provider.name).toBe('bedrock');
    expect(route.model).toBe('anthropic.claude-3-7-sonnet-20250219-v1:0');
  });

  it('supports cross-region Bedrock inference profiles natively', () => {
    const config = resolveConfig(
      {
        bedrockApiKey: 'bedrock-test-key',
        awsRegion: 'us-east-1',
      },
      dummyCfg
    );
    const router = new ProviderRouter(config);
    const route = router.resolveProviderForModel('us.anthropic.claude-3-7-sonnet-20250219-v1:0');

    expect(route.provider.name).toBe('bedrock');
    expect(route.model).toBe('us.anthropic.claude-3-7-sonnet-20250219-v1:0');
  });
});
