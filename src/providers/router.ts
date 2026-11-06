import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { OverwatchConfig, MentorConfig } from '../config.js';
import { MentorProvider, ProviderHealth, ProviderRequestOptions } from './base.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { OpenRouterProvider } from './openrouter.js';
import { BedrockProvider } from './bedrock.js';
import { CustomProvider } from './custom.js';
import { AntigravityProvider } from './antigravity.js';
import { MockProvider } from './mock.js';
import { parseOverwatchFeedback } from '../prompts/parser.js';
import { OverwatchFeedback, UsageStats } from '../types.js';
import { LOG_PREFIX } from '../constants.js';
import { getModelDefaults } from '../tiers.js';

export interface RouteResolution {
  provider: MentorProvider;
  model: string;
}

export function normalizeBedrockClaudeModel(modelName: string): string {
  const m = modelName.toLowerCase();
  const clean = modelName.replace(/^bedrock\//, '');
  if (
    clean.startsWith('anthropic.') ||
    clean.startsWith('us.') ||
    clean.startsWith('eu.') ||
    clean.startsWith('global.')
  ) {
    return clean;
  }
  if (m.includes('3-7-sonnet') || m.includes('sonnet-3-7')) {
    return 'anthropic.claude-3-7-sonnet-20250219-v1:0';
  }
  if (m.includes('3-5-sonnet') || m.includes('sonnet-3-5')) {
    return 'anthropic.claude-3-5-sonnet-20241022-v2:0';
  }
  if (m.includes('opus-5') || m.includes('5-5-opus') || m.includes('opus-5.5')) {
    return 'us.anthropic.claude-opus-5-5-v1:0';
  }
  if (m.includes('opus-4') || m.includes('4-5-opus') || m.includes('opus-4.5')) {
    return 'us.anthropic.claude-opus-4-5-20251101-v1:0';
  }
  if (m.includes('opus')) {
    return 'anthropic.claude-3-opus-20240229-v1:0';
  }
  return 'anthropic.claude-3-7-sonnet-20250219-v1:0';
}

export class ProviderRouter {
  private config: OverwatchConfig;
  private mockProvider?: MockProvider;
  private mcpServer?: Server;
  private samplingHandler?: any;

  constructor(
    config: OverwatchConfig,
    mockProvider?: MockProvider,
    options?: { mcpServer?: Server; samplingHandler?: any }
  ) {
    this.config = config;
    if (mockProvider) {
      this.mockProvider = mockProvider;
    }
    if (options?.mcpServer) {
      this.mcpServer = options.mcpServer;
    }
    if (options?.samplingHandler) {
      this.samplingHandler = options.samplingHandler;
    }
  }

  public setMcpServer(server: Server): void {
    this.mcpServer = server;
  }

  public setConfig(config: OverwatchConfig): void {
    this.config = config;
  }

  public resolveProviderForModel(modelName: string, requestedProvider?: string): RouteResolution {
    if (this.mockProvider || process.env.OVERWATCH_MOCK_PROVIDER === 'true') {
      return {
        provider: this.mockProvider || new MockProvider(),
        model: modelName,
      };
    }

    const m = modelName.toLowerCase();

    // 1. Explicit Model Prefix in Model Name (takes highest precedence)
    if (m.startsWith('antigravity/')) {
      const cleanModel = modelName.replace(/^antigravity\//, '');
      return {
        provider: new AntigravityProvider({
          defaultModel: cleanModel,
          mcpServer: this.mcpServer,
          samplingHandler: this.samplingHandler,
          subagentModel: this.config.antigravitySubagentModel,
        }),
        model: cleanModel,
      };
    }

    if (m.startsWith('bedrock/')) {
      const cleanModel = normalizeBedrockClaudeModel(modelName);
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
      if (this.config.customProtocol === 'anthropic') {
        return {
          provider: new AnthropicProvider(
            this.config.customApiKey || this.config.anthropicApiKey || 'no-key-required',
            this.config.customBaseUrl || 'http://localhost:8000',
            cleanModel
          ),
          model: cleanModel,
        };
      }
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

    // 2. Explicit Provider Selection (via per-call requestedProvider or config.mentorProvider)
    const explicitProvider = requestedProvider || this.config.mentorProvider;
    const hasBedrockAuth =
      Boolean(this.config.bedrockApiKey) ||
      Boolean(this.config.awsAccessKeyId && this.config.awsSecretAccessKey);

    if (explicitProvider) {
      const p = explicitProvider.toLowerCase();
      if (p === 'antigravity') {
        const cleanModel = modelName.replace(/^antigravity\//, '');
        return {
          provider: new AntigravityProvider({
            defaultModel: cleanModel,
            mcpServer: this.mcpServer,
            samplingHandler: this.samplingHandler,
            subagentModel: this.config.antigravitySubagentModel,
          }),
          model: cleanModel,
        };
      }

      if (p === 'bedrock') {
        const cleanModel = normalizeBedrockClaudeModel(modelName);
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
        if ((m.includes('opus') || m.includes('sonnet') || m.includes('haiku')) && !orModel.includes('/')) {
          orModel = `anthropic/${orModel}`;
        } else if ((m.includes('gemini') || m.includes('argon') || m.includes('astra')) && !orModel.includes('/')) {
          orModel = `google/${orModel}`;
        } else if ((m.startsWith('o3') || m.startsWith('o1') || m.includes('gpt-')) && !orModel.includes('/')) {
          orModel = `openai/${orModel}`;
        }
        return {
          provider: new OpenRouterProvider(this.config.openrouterApiKey || '', this.config.openrouterBaseUrl),
          model: orModel,
        };
      }

      if (p === 'custom') {
        const cleanModel = modelName.replace(/^(custom|local|ollama)\//, '');
        if (this.config.customProtocol === 'anthropic') {
          return {
            provider: new AnthropicProvider(
              this.config.customApiKey || this.config.anthropicApiKey || 'no-key-required',
              this.config.customBaseUrl || 'http://localhost:8000',
              cleanModel
            ),
            model: cleanModel,
          };
        }
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

    // 3. Amazon Bedrock specific model IDs
    if (
      hasBedrockAuth &&
      (m.startsWith('amazon.') ||
        m.startsWith('anthropic.claude') ||
        m.startsWith('us.anthropic.') ||
        m.startsWith('eu.anthropic.') ||
        m.startsWith('global.anthropic.') ||
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

    // 4. Direct Anthropic for Claude models when Anthropic key is present
    if (this.config.anthropicApiKey && m.includes('claude')) {
      return {
        provider: new AnthropicProvider(this.config.anthropicApiKey, this.config.anthropicBaseUrl),
        model: modelName,
      };
    }

    // 5. Direct Gemini for Gemini/Argon/Astra models when Gemini key is present
    if (this.config.geminiApiKey && (m.includes('gemini') || m.includes('argon') || m.includes('astra'))) {
      return {
        provider: new GeminiProvider(this.config.geminiApiKey, this.config.geminiBaseUrl),
        model: modelName,
      };
    }

    // 6. Direct OpenAI for o3/o1/gpt models
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

    // 7. Amazon Bedrock for Claude if Bedrock credentials exist
    if (hasBedrockAuth && m.includes('claude')) {
      const bedrockClaudeModel = normalizeBedrockClaudeModel(modelName);
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

    // 8. Custom Base URL (e.g. Ollama or local gateway)
    if (this.config.customBaseUrl) {
      if (this.config.customProtocol === 'anthropic') {
        return {
          provider: new AnthropicProvider(
            this.config.customApiKey || this.config.anthropicApiKey || 'no-key-required',
            this.config.customBaseUrl,
            modelName
          ),
          model: modelName,
        };
      }
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

    // 9. OpenRouter (routes any model)
    if (this.config.openrouterApiKey) {
      let orModel = modelName;
      if ((m.includes('opus') || m.includes('sonnet') || m.includes('haiku')) && !orModel.includes('/')) {
        orModel = `anthropic/${modelName}`;
      } else if ((m.includes('gemini') || m.includes('argon') || m.includes('astra')) && !orModel.includes('/')) {
        orModel = `google/${modelName}`;
      } else if ((m.startsWith('o3') || m.startsWith('o1') || m.includes('gpt-')) && !orModel.includes('/')) {
        orModel = `openai/${modelName}`;
      }
      return {
        provider: new OpenRouterProvider(this.config.openrouterApiKey, this.config.openrouterBaseUrl),
        model: orModel,
      };
    }

    // 10. Fallback to any direct provider using seed defaults
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

    // 11. Antigravity Native fallback if running inside Antigravity
    return {
      provider: new AntigravityProvider({
        defaultModel: modelName || 'gemini-4-argon',
        mcpServer: this.mcpServer,
        samplingHandler: this.samplingHandler,
        subagentModel: this.config.antigravitySubagentModel,
      }),
      model: modelName || 'gemini-4-argon',
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
        let providerOverride: MentorProvider | undefined;
        if (fb.apiKey || fb.baseUrl || fb.region || fb.headers) {
          if (fb.provider === 'anthropic') {
            providerOverride = new AnthropicProvider(fb.apiKey || '', fb.baseUrl);
          } else if (fb.provider === 'gemini') {
            providerOverride = new GeminiProvider(fb.apiKey || '', fb.baseUrl);
          } else if (fb.provider === 'openai') {
            providerOverride = new OpenAIProvider(fb.apiKey || 'no-key-required', fb.baseUrl);
          } else if (fb.provider === 'openrouter') {
            providerOverride = new OpenRouterProvider(fb.apiKey || '', fb.baseUrl);
          } else if (fb.provider === 'bedrock') {
            providerOverride = new BedrockProvider({
              apiKey: fb.apiKey,
              baseUrl: fb.baseUrl,
              region: fb.region,
              defaultModel: fb.model,
            });
          } else if (fb.provider === 'custom') {
            providerOverride = new CustomProvider({
              baseUrl: fb.baseUrl || 'http://localhost:11434/v1',
              apiKey: fb.apiKey,
              customHeaders: fb.headers,
              defaultModel: fb.model,
            });
          }
        }

        candidateConfigs.push({
          model: fb.model,
          providerOverride,
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
        parsed.modelUsed = model;
        parsed.providerUsed = provider.name;
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
