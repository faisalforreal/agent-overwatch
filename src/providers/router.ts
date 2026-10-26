import { OverwatchConfig, MentorConfig } from '../config.js';
import { MentorProvider, ProviderHealth, ProviderRequestOptions } from './base.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { OpenRouterProvider } from './openrouter.js';
import { MockProvider } from './mock.js';
import { parseOverwatchFeedback } from '../prompts/parser.js';
import { OverwatchFeedback } from '../types.js';
import { LOG_PREFIX } from '../constants.js';
import { getModelDefaults } from '../tiers.js';

export interface RouteResolution {
  provider: MentorProvider;
  model: string;
}

export class ProviderRouter {
  private config: OverwatchConfig;
  private mockProvider?: MockProvider;

  constructor(config: OverwatchConfig, mockProvider?: MockProvider) {
    this.config = config;
    if (mockProvider) {
      this.mockProvider = mockProvider;
    }
  }

  public resolveProviderForModel(modelName: string): RouteResolution {
    if (this.mockProvider || process.env.OVERWATCH_MOCK_PROVIDER === 'true') {
      return {
        provider: this.mockProvider || new MockProvider(),
        model: modelName,
      };
    }

    const m = modelName.toLowerCase();

    // 1. Direct Anthropic
    if (
      this.config.anthropicApiKey &&
      (m.includes('claude') || m.startsWith('anthropic/'))
    ) {
      const cleanModel = modelName.replace(/^anthropic\//, '');
      return {
        provider: new AnthropicProvider(this.config.anthropicApiKey),
        model: cleanModel,
      };
    }

    // 2. Direct Gemini
    if (
      this.config.geminiApiKey &&
      (m.includes('gemini') || m.startsWith('google/'))
    ) {
      const cleanModel = modelName.replace(/^google\//, '');
      return {
        provider: new GeminiProvider(this.config.geminiApiKey),
        model: cleanModel,
      };
    }

    // 3. Direct OpenAI or custom endpoint
    if (
      (this.config.openaiApiKey || this.config.openaiBaseUrl) &&
      (m.startsWith('o1') ||
        m.startsWith('o3') ||
        m.includes('gpt-') ||
        m.startsWith('openai/'))
    ) {
      const cleanModel = modelName.replace(/^openai\//, '');
      return {
        provider: new OpenAIProvider(
          this.config.openaiApiKey || 'no-key-required',
          this.config.openaiBaseUrl
        ),
        model: cleanModel,
      };
    }

    // 4. OpenRouter (can route any model name including anthropic/..., google/..., fable-...)
    if (this.config.openrouterApiKey) {
      let orModel = modelName;
      if (m.includes('opus') && !m.includes('/')) {
        orModel = `anthropic/${modelName}`;
      } else if (m.includes('gemini') && !m.includes('/')) {
        orModel = `google/${modelName}`;
      } else if (m.startsWith('o3') || m.startsWith('o1')) {
        orModel = `openai/${modelName}`;
      }
      return {
        provider: new OpenRouterProvider(this.config.openrouterApiKey),
        model: orModel,
      };
    }

    // 5. Fallback to any available direct provider using seed defaults
    const providerDefaults = getModelDefaults().providerDefaults || {};
    if (this.config.anthropicApiKey) {
      return {
        provider: new AnthropicProvider(this.config.anthropicApiKey),
        model: providerDefaults.anthropic || 'claude-3-opus-20240229',
      };
    }
    if (this.config.geminiApiKey) {
      return {
        provider: new GeminiProvider(this.config.geminiApiKey),
        model: providerDefaults.gemini || 'gemini-2.0-pro-exp-02-05',
      };
    }
    if (this.config.openaiApiKey || this.config.openaiBaseUrl) {
      return {
        provider: new OpenAIProvider(
          this.config.openaiApiKey || 'no-key-required',
          this.config.openaiBaseUrl
        ),
        model: providerDefaults.openai || 'o3-mini',
      };
    }

    // If no provider keys exist, return mock with failure warning
    return {
      provider: new MockProvider({
        shouldFail: true,
        failureMessage:
          'No provider API keys configured. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.',
      }),
      model: modelName,
    };
  }

  public async healthCheck(modelOverride?: string): Promise<ProviderHealth> {
    const targetModel = modelOverride || this.config.mentorModel;
    const { provider, model } = this.resolveProviderForModel(targetModel);
    return provider.healthCheck(model);
  }

  public async executeReviewWithFallbacks(
    options: Omit<ProviderRequestOptions, 'model'> & { model?: string }
  ): Promise<OverwatchFeedback> {
    const primaryModel = options.model || this.config.mentorModel;
    const candidateConfigs: Array<{ model: string; providerOverride?: MentorProvider }> = [
      { model: primaryModel },
    ];

    // Add configured mentor fallbacks
    if (this.config.mentorFallbacks && this.config.mentorFallbacks.length > 0) {
      for (const fb of this.config.mentorFallbacks) {
        candidateConfigs.push({ model: fb.model });
      }
    }

    let lastError: any = null;

    for (const candidate of candidateConfigs) {
      try {
        const { provider, model } = candidate.providerOverride
          ? { provider: candidate.providerOverride, model: candidate.model }
          : this.resolveProviderForModel(candidate.model);

        const result = await provider.generate({
          ...options,
          model,
          maxTokens: options.maxTokens || this.config.maxOutputTokens,
          timeoutMs: options.timeoutMs || this.config.requestTimeoutMs,
          enableThinking: options.enableThinking ?? this.config.enableThinking,
          thinkingBudgetTokens:
            options.thinkingBudgetTokens ?? this.config.thinkingBudgetTokens,
          fastMode: options.fastMode ?? this.config.fastMode,
          enablePromptCaching:
            options.enablePromptCaching ?? this.config.enablePromptCaching,
        });

        const parsed = parseOverwatchFeedback(result.rawText);
        parsed.usage = result.usage;
        return parsed;
      } catch (err: any) {
        lastError = err;
        console.error(
          `${LOG_PREFIX} Provider call failed for model '${candidate.model}':`,
          err?.message || err
        );
        // Continue to next fallback in ladder
      }
    }

    throw new Error(
      `All mentor provider attempts failed. Last error: ${lastError?.message || String(lastError)}`
    );
  }
}
