import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveConfig, saveConfigFile, maskApiKey } from '../src/config.js';

describe('Configuration Engine', () => {
  const tmpDir = path.join(os.tmpdir(), `overwatch-test-${Date.now()}`);
  const tmpConfigFile = path.join(tmpDir, 'config.json');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('masks API keys securely', () => {
    expect(maskApiKey('sk-ant-api03-abcdefgh12345678')).toBe('sk-a...5678');
    expect(maskApiKey('short')).toBe('********');
    expect(maskApiKey(undefined)).toBe('(not set)');
  });

  it('saves and loads configuration file with 0600 permissions', () => {
    saveConfigFile(
      {
        mentorModel: 'claude-opus-5',
        juniorModel: 'gemini-3.8-flash',
        maxCallsPerSession: 20,
      },
      tmpConfigFile
    );

    const stat = fs.statSync(tmpConfigFile);
    // On POSIX, check mode 0600 (33152 in octal is 100600)
    if (process.platform !== 'win32') {
      expect(stat.mode & 0o777).toBe(0o600);
    }

    const config = resolveConfig({}, tmpConfigFile);
    expect(config.mentorModel).toBe('claude-opus-5');
    expect(config.juniorModel).toBe('gemini-3.8-flash');
    expect(config.maxCallsPerSession).toBe(20);
  });

  it('honors precedence: overrides > env vars > file config', () => {
    saveConfigFile(
      {
        mentorModel: 'file-model',
      },
      tmpConfigFile
    );

    process.env.OVERWATCH_MENTOR_MODEL = 'env-model';

    // 1. Env overrides file
    let resolved = resolveConfig({}, tmpConfigFile);
    expect(resolved.mentorModel).toBe('env-model');

    // 2. Call override overrides env
    resolved = resolveConfig({ mentorModel: 'override-model' }, tmpConfigFile);
    expect(resolved.mentorModel).toBe('override-model');

    delete process.env.OVERWATCH_MENTOR_MODEL;
  });

  it('resolves Bedrock and generic custom endpoint configuration', () => {
    process.env.BEDROCK_API_KEY = 'bedrock-test-key-12345';
    process.env.AWS_REGION = 'us-west-2';
    process.env.CUSTOM_BASE_URL = 'http://localhost:11434/v1';
    process.env.CUSTOM_API_KEY = 'ollama-no-key';

    const cfg = resolveConfig({}, tmpConfigFile);
    expect(cfg.bedrockApiKey).toBe('bedrock-test-key-12345');
    expect(cfg.awsRegion).toBe('us-west-2');
    expect(cfg.customBaseUrl).toBe('http://localhost:11434/v1');
    expect(cfg.customApiKey).toBe('ollama-no-key');

    delete process.env.BEDROCK_API_KEY;
    delete process.env.AWS_REGION;
    delete process.env.CUSTOM_BASE_URL;
    delete process.env.CUSTOM_API_KEY;
  });
});
