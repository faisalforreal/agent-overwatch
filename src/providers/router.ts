import { OverwatchConfig, MentorConfig } from '../config.js';
import { MentorProvider, ProviderHealth, ProviderRequestOptions } from './base.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { OpenRouterProvider } from './openrouter.js';
import { BedrockProvider } from './bedrock.js';
import { CustomProvider } from './custom.js';
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

  public resolveProviderForModel(modelName: string, requestedProvider?: string): RouteResolution {
    if (this.mockProvider || process.env.OVERWATCH_MOCK_PROVIDER === 'true') {
      return {
        provider: this.mockProvider || new MockProvider(),
        model: modelName,
      };
    }

    const m = modelName.toLowerCase();
    const explicitProvider = requestedProvider || this.config.mentorProvider;

    const hasBedrockAuth =
      Boolean(this.config.bedrockApiKey) ||
      Boolean(this.config.awsAccessKeyId && this.config.awsSecretAccessKey);

    // 1. Explicit Provider (via config.mentorProvider or per-call requestedProvider)
    if (explicitProvider) {
      const p = explicitProvider.toLowerCase();
      if (p === 'bedrock') {
        let cleanModel = modelName.replace(/^bedrock\//, '');
        if (m.includes('claude')) {
          cleanModel = m.includes('3-7-sonnet')
            ? 'anthropic.claude-3-7-sonnet-20250219-v1:0'
            : m.includes('3-5-sonnet')
              ? 'anthropic.claude-3-5-sonnet-20241022-v2:0'
              : m.includes('opus')
                ? 'anthropic.claude-3-opus-20240229-v1:0'
                : cleanModel.startsWith('anthropic.') || cleanModel.startsWith('us.') || cleanModel.startsWith('eu.')
                  ? cleanModel
                  : 'anthropic.claude-3-7-sonnet-20250219-v1:0';
        }
        return {
          provider: new BedrockProvider({
            apiKey: this.config.bedrockApiKey,
            accessKeyId: this.config.awsAccessKeyId,
            secretAccessKey: this.config.awsSecretAccessKey,
            sessionToken: this.config.awsSessionToken,
            region: this.config.awsRegion,
            baseUrl: this.config.bedrockBaseUrl,
            defaultModel: cleanModel,
          }),
          model: cleanModel,
        };
      }

      if (p === 'anthropic') {
        const cleanModel = modelName.replace(/^anthropic\//, '');
        return {
          provider: new AnthropicProvider(this.config.anthropicApiKey || '', this.config.anthropicBaseUrl),
          model: cleanModel,
        };
      }

      if (p === 'gemini') {
        const cleanModel = modelName.replace(/^(google|gemini)\//, '');
        return {
          provider: new GeminiProvider(this.config.geminiApiKey || '', this.config.geminiBaseUrl),
          model: cleanModel,
        };
      }

      if (p === 'openai') {
        const cleanModel = modelName.replace(/^openai\//, '');
        return {
          provider: new OpenAIProvider(
            this.config.openaiApiKey || 'no-key-required',
            this.config.openaiBaseUrl
          ),
          model: cleanModel,
        };
      }

      if (p === 'openrouter') {
        let orModel = modelName.replace(/^openrouter\//, '');
        if (m.includes('opus') && !orModel.includes('/')) {
          orModel = `anthropic/${orModel}`;
        } else if (m.includes('gemini') && !orModel.includes('/')) {
          orModel = `google/${orModel}`;
        } else if ((m.startsWith('o3') || m.startsWith('o1')) && !orModel.includes('/')) {
          orModel = `openai/${orModel}`;
        }
        return {
          provider: new OpenRouterProvider(this.config.openrouterApiKey || '', this.config.openrouterBaseUrl),
          model: orModel,
        };
      }

      if (p === 'custom') {
        const cleanModel = modelName.replace(/^(custom|local|ollama)\//, '');
        return {
          provider: new CustomProvider({
            baseUrl: this.config.customBaseUrl || 'http://localhost:11434/v1',
            apiKey: this.config.customApiKey,
            customHeaders: this.config.customHeaders,
            defaultModel: cleanModel,
          }),
          model: cleanModel,
        };
      }
    }

    // 2. Explicit Provider Prefix in Model Name
    if (m.startsWith('bedrock/')) {
      const cleanModel = modelName.replace(/^bedrock\//, '');
      return {
        provider: new BedrockProvider({
          apiKey: this.config.bedrockApiKey,
          accessKeyId: this.config.awsAccessKeyId,
          secretAccessKey: this.config.awsSecretAccessKey,
          sessionToken: this.config.awsSessionToken,
          region: this.config.awsRegion,
          baseUrl: this.config.bedrockBaseUrl,
          defaultModel: cleanModel,
        }),
        model: cleanModel,
      };
    }

    if (m.startsWith('openrouter/')) {
      const cleanModel = modelName.replace(/^openrouter\//, '');
      return {
        provider: new OpenRouterProvider(this.config.openrouterApiKey || '', this.config.openrouterBaseUrl),
        model: cleanModel,
      };
    }

    if (m.startsWith('anthropic/')) {
      const cleanModel = modelName.replace(/^anthropic\//, '');
      return {
        provider: new AnthropicProvider(this.config.anthropicApiKey || '', this.config.anthropicBaseUrl),
        model: cleanModel,
      };
    }

    if (m.startsWith('google/') || m.startsWith('gemini/')) {
      const cleanModel = modelName.replace(/^(google|gemini)\//, '');
      return {
        provider: new GeminiProvider(this.config.geminiApiKey || '', this.config.geminiBaseUrl),
        model: cleanModel,
      };
    }

    if (m.startsWith('custom/') || m.startsWith('local/') || m.startsWith('ollama/')) {
      const cleanModel = modelName.replace(/^(custom|local|ollama)\//, '');
      return {
        provider: new CustomProvider({
          baseUrl: this.config.customBaseUrl || 'http://localhost:11434/v1',
          apiKey: this.config.customApiKey || this.config.openaiApiKey,
          customHeaders: this.config.customHeaders,
          defaultModel: cleanModel,
          name: m.startsWith('ollama/') ? 'ollama' : 'custom',
        }),
        model: cleanModel,
      };
    }

    if (m.startsWith('openai/')) {
      const cleanModel = modelName.replace(/^openai\//, '');
      return {
        provider: new OpenAIProvider(
          this.config.openaiApiKey || 'no-key-required',
          this.config.openaiBaseUrl
        ),
        model: cleanModel,
      };
    }

    // 3. Amazon Bedrock specific model IDs (e.g. amazon.*, anthropic.claude*, us.anthropic.*, eu.anthropic.*, meta.llama*)
    if (
      hasBedrockAuth &&
      (m.startsWith('amazon.') ||
        m.startsWith('anthropic.claude') ||
        m.startsWith('us.anthropic.') ||
        m.startsWith('eu.anthropic.') ||
        m.startsWith('meta.llama'))
    ) {
      return {
        provider: new BedrockProvider({
          apiKey: this.config.bedrockApiKey,
          accessKeyId: this.config.awsAccessKeyId,
          secretAccessKey: this.config.awsSecretAccessKey,
          sessionToken: this.config.awsSessionToken,
          region: this.config.awsRegion,
          baseUrl: this.config.bedrockBaseUrl,
          defaultModel: modelName,
        }),
        model: modelName,
      };
    }

    // 4. Direct Anthropic
    if (this.config.anthropicApiKey && m.includes('claude')) {
      return {
        provider: new AnthropicProvider(this.config.anthropicApiKey, this.config.anthropicBaseUrl),
        model: modelName,
      };
    }

    // 5. Direct Gemini
    if (this.config.geminiApiKey && m.includes('gemini')) {
      return {
        provider: new GeminiProvider(this.config.geminiApiKey, this.config.geminiBaseUrl),
        model: modelName,
      };
    }

    // 6. Direct OpenAI
    const isOpenAiModel = m.startsWith('o1') || m.startsWith('o3') || m.includes('gpt-');
    if ((this.config.openaiApiKey || this.config.openaiBaseUrl) && isOpenAiModel) {
      return {
        provider: new OpenAIProvider(
          this.config.openaiApiKey || 'no-key-required',
          this.config.openaiBaseUrl
        ),
        model: modelName,
      };
    }

    // 7. Amazon Bedrock for Claude if Bedrock keys exist and direct Anthropic key does not
    if (hasBedrockAuth && m.includes('claude')) {
      const bedrockClaudeModel =
        m.includes('3-7-sonnet')
          ? 'anthropic.claude-3-7-sonnet-20250219-v1:0'
          : m.includes('3-5-sonnet')
            ? 'anthropic.claude-3-5-sonnet-20241022-v2:0'
            : m.includes('opus')
              ? 'anthropic.claude-3-opus-20240229-v1:0'
              : 'anthropic.claude-3-7-sonnet-20250219-v1:0';
      return {
        provider: new BedrockProvider({
          apiKey: this.config.bedrockApiKey,
          accessKeyId: this.config.awsAccessKeyId,
          secretAccessKey: this.config.awsSecretAccessKey,
          sessionToken: this.config.awsSessionToken,
          region: this.config.awsRegion,
          baseUrl: this.config.bedrockBaseUrl,
          defaultModel: bedrockClaudeModel,
        }),
        model: bedrockClaudeModel,
      };
    }

    // 8. Custom Base URL (handles non-vendor models like llama3.3:70b when customBaseUrl is set)
    if (this.config.customBaseUrl) {
      return {
        provider: new CustomProvider({
          baseUrl: this.config.customBaseUrl,
          apiKey: this.config.customApiKey,
          customHeaders: this.config.customHeaders,
          defaultModel: modelName,
        }),
        model: modelName,
      };
    }

    // 9. OpenRouter (can route any model name including anthropic/..., google/..., fable-...)
    if (this.config.openrouterApiKey) {
      let orModel = modelName;
      if (m.includes('opus') && !orModel.includes('/')) {
        orModel = `anthropic/${modelName}`;
      } else if (m.includes('gemini') && !orModel.includes('/')) {
        orModel = `google/${modelName}`;
      } else if (m.startsWith('o3') || m.startsWith('o1')) {
        orModel = `openai/${modelName}`;
      }
      return {
        provider: new OpenRouterProvider(this.config.openrouterApiKey, this.config.openrouterBaseUrl),
        model: orModel,
      };
    }

    // 10. Fallback to any available direct provider using seed defaults
    const providerDefaults = getModelDefaults().providerDefaults || {};
    if (this.config.anthropicApiKey) {
      return {
        provider: new AnthropicProvider(this.config.anthropicApiKey, this.config.anthropicBaseUrl),
        model: providerDefaults.anthropic || 'claude-3-opus-20240229',
      };
    }
    if (this.config.geminiApiKey) {
      return {
        provider: new GeminiProvider(this.config.geminiApiKey, this.config.geminiBaseUrl),
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
    if (hasBedrockAuth) {
      return {
        provider: new BedrockProvider({
          apiKey: this.config.bedrockApiKey,
          accessKeyId: this.config.awsAccessKeyId,
          secretAccessKey: this.config.awsSecretAccessKey,
          sessionToken: this.config.awsSessionToken,
          region: this.config.awsRegion,
          baseUrl: this.config.bedrockBaseUrl,
        }),
        model: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
      };
    }

    // If no provider keys exist, return mock with failure warning
    return {
      provider: new MockProvider({
        shouldFail: true,
        failureMessage:
          'No provider API keys configured. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, BEDROCK_API_KEY (or AWS credentials), or CUSTOM_BASE_URL.',
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
    options: Omit<ProviderRequestOptions, 'model'> & {
      model?: string;
      mentorProvider?: string;
    }
  ): Promise<OverwatchFeedback> {
    const primaryModel = options.model || this.config.mentorModel;
    const candidateConfigs: Array<{
      model: string;
      providerOverride?: MentorProvider;
      mentorProvider?: string;
    }> = [{ model: primaryModel, mentorProvider: options.mentorProvider || this.config.mentorProvider }];

    // Add configured mentor fallbacks
    if (this.config.mentorFallbacks && this.config.mentorFallbacks.length > 0) {
      for (const fb of this.config.mentorFallbacks) {
        candidateConfigs.push({
          model: fb.model,
          mentorProvider: fb.provider,
        });
      }
    }

    let lastError: any = null;

    for (const candidate of candidateConfigs) {
      try {
        const { provider, model } = candidate.providerOverride
          ? { provider: candidate.providerOverride, model: candidate.model }
          : this.resolveProviderForModel(candidate.model, candidate.mentorProvider);

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
