import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';
import {
  APP_NAME,
  CONFIG_DIR_NAME,
  CONFIG_FILE,
  DEFAULT_SESSION_CALL_CAP,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TOOL_TIMEOUTS,
  DEFAULT_THINKING_BUDGET,
  LOG_PREFIX,
} from './constants.js';
import { getModelDefaults } from './tiers.js';

// Load .env if present in current working directory
dotenv.config();

export interface MentorConfig {
  provider: 'anthropic' | 'gemini' | 'openai' | 'openrouter' | 'mock';
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface OverwatchConfig {
  openrouterApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;

  juniorModel: string;
  mentorModel: string;
  mentorFallbacks: MentorConfig[];

  maxCallsPerSession: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  toolTimeouts: Record<string, number>;

  includeGlobs: string[];
  excludeGlobs: string[];

  enableThinking: boolean;
  thinkingBudgetTokens: number;
  fastMode: boolean;
  enablePromptCaching: boolean;
  allowSameTier: boolean;
}

export function maskApiKey(key?: string): string {
  if (!key) return '(not set)';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '********';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function getGlobalConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

export function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), CONFIG_FILE);
}

export function loadConfigFile(customPath?: string): Partial<OverwatchConfig> {
  const filePath = customPath || getGlobalConfigPath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Warning: Failed to parse config file at ${filePath}:`, err);
  }
  return {};
}

export function saveConfigFile(
  config: Partial<OverwatchConfig>,
  customPath?: string
): void {
  const dirPath = customPath ? path.dirname(customPath) : getGlobalConfigDir();
  const filePath = customPath || getGlobalConfigPath();

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }

  // Merge with existing
  const existing = loadConfigFile(filePath);
  const merged = { ...existing, ...config };

  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), {
    mode: 0o600, // Restrictive permissions
    encoding: 'utf-8',
  });
}

/**
 * Resolves configuration by strict precedence:
 * Per-call overrides > Environment variables > .env > ~/.overwatch/config.json > Defaults
 */
export function resolveConfig(
  overrides: Partial<OverwatchConfig> = {},
  customConfigPath?: string
): OverwatchConfig {
  const fileConfig = loadConfigFile(customConfigPath);
  const modelDefaults = getModelDefaults();
  const envPrefix = APP_NAME.toUpperCase();

  const envOpenRouter = process.env.OPENROUTER_API_KEY;
  const envAnthropic = process.env.ANTHROPIC_API_KEY;
  const envGemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const envOpenAI = process.env.OPENAI_API_KEY;
  const envOpenAIBaseUrl = process.env.OPENAI_BASE_URL;

  const envJuniorModel =
    process.env[`${envPrefix}_JUNIOR_MODEL`] || process.env.OVERWATCH_JUNIOR_MODEL;
  const envMentorModel =
    process.env[`${envPrefix}_MENTOR_MODEL`] || process.env.OVERWATCH_MENTOR_MODEL;
  const envMaxCallsStr =
    process.env[`${envPrefix}_MAX_CALLS`] || process.env.OVERWATCH_MAX_CALLS;
  const envMaxCalls = envMaxCallsStr ? parseInt(envMaxCallsStr, 10) : undefined;
  const envTimeoutStr =
    process.env[`${envPrefix}_TIMEOUT_MS`] || process.env.OVERWATCH_TIMEOUT_MS;
  const envTimeout = envTimeoutStr ? parseInt(envTimeoutStr, 10) : undefined;

  return {
    openrouterApiKey:
      overrides.openrouterApiKey ?? envOpenRouter ?? fileConfig.openrouterApiKey,
    anthropicApiKey:
      overrides.anthropicApiKey ?? envAnthropic ?? fileConfig.anthropicApiKey,
    geminiApiKey:
      overrides.geminiApiKey ?? envGemini ?? fileConfig.geminiApiKey,
    openaiApiKey:
      overrides.openaiApiKey ?? envOpenAI ?? fileConfig.openaiApiKey,
    openaiBaseUrl:
      overrides.openaiBaseUrl ?? envOpenAIBaseUrl ?? fileConfig.openaiBaseUrl,

    juniorModel:
      overrides.juniorModel ??
      envJuniorModel ??
      fileConfig.juniorModel ??
      modelDefaults.junior,

    mentorModel:
      overrides.mentorModel ??
      envMentorModel ??
      fileConfig.mentorModel ??
      modelDefaults.mentor,

    mentorFallbacks:
      overrides.mentorFallbacks ?? fileConfig.mentorFallbacks ?? [],

    maxCallsPerSession:
      overrides.maxCallsPerSession ??
      envMaxCalls ??
      fileConfig.maxCallsPerSession ??
      DEFAULT_SESSION_CALL_CAP,

    maxOutputTokens:
      overrides.maxOutputTokens ??
      fileConfig.maxOutputTokens ??
      DEFAULT_MAX_OUTPUT_TOKENS,

    requestTimeoutMs:
      overrides.requestTimeoutMs ??
      envTimeout ??
      fileConfig.requestTimeoutMs ??
      DEFAULT_TIMEOUT_MS,

    toolTimeouts: {
      ...DEFAULT_TOOL_TIMEOUTS,
      ...(fileConfig.toolTimeouts || {}),
      ...(overrides.toolTimeouts || {}),
    },

    includeGlobs:
      overrides.includeGlobs ?? fileConfig.includeGlobs ?? ['**/*'],

    excludeGlobs: overrides.excludeGlobs ??
      fileConfig.excludeGlobs ?? [
        '.env*',
        '**/*.pem',
        '**/*.key',
        '**/*.cert',
        '**/*.crt',
        '**/*.pfx',
        '**/id_rsa*',
        '**/id_ed25519*',
        'node_modules/**',
        'dist/**',
        '.git/**',
        `.${APP_NAME}/**`,
      ],

    enableThinking:
      overrides.enableThinking ?? fileConfig.enableThinking ?? true,

    thinkingBudgetTokens:
      overrides.thinkingBudgetTokens ??
      fileConfig.thinkingBudgetTokens ??
      DEFAULT_THINKING_BUDGET,

    fastMode:
      overrides.fastMode ?? fileConfig.fastMode ?? false,

    enablePromptCaching:
      overrides.enablePromptCaching ?? fileConfig.enablePromptCaching ?? true,

    allowSameTier:
      overrides.allowSameTier ?? fileConfig.allowSameTier ?? false,
  };
}
