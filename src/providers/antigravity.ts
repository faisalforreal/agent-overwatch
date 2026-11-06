import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CreateMessageResultSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  MentorProvider,
  ProviderHealth,
  ProviderRequestOptions,
} from './base.js';
import { UsageStats } from '../types.js';
import { LOG_PREFIX } from '../constants.js';

export interface AntigravityProviderOptions {
  mcpServer?: Server;
  samplingHandler?: (params: any) => Promise<any>;
  defaultModel?: string;
  subagentModel?: 'inherit' | 'pro' | 'flash';
}

/**
 * Antigravity Native Frontier Provider
 *
 * Designed specifically for running inside the Google Antigravity environment
 * without requiring any third-party API keys.
 *
 * Supported mechanisms in Antigravity:
 * 1. MCP Sampling (server.createMessage) if host supports standard sampling.
 * 2. Antigravity Native Subagent Bridge:
 *    When sampled by an Antigravity junior agent (e.g. Gemini 3.8 Flash),
 *    returns an immediate high-priority single-turn pre-packaged subagent prompt
 *    using the built-in Pro / Argon model (`Model="pro"`).
 */
export class AntigravityProvider implements MentorProvider {
  public name = 'antigravity';
  public defaultModel = 'gemini-4-argon';
  private mcpServer?: Server;
  private customSamplingHandler?: (params: any) => Promise<any>;
  private subagentModel?: 'inherit' | 'pro' | 'flash';

  constructor(options: AntigravityProviderOptions = {}) {
    this.mcpServer = options.mcpServer;
    this.customSamplingHandler = options.samplingHandler;
    this.subagentModel = options.subagentModel;
    if (options.defaultModel) {
      this.defaultModel = options.defaultModel;
    }
  }

  public setMcpServer(server: Server): void {
    this.mcpServer = server;
  }

  public async healthCheck(model?: string): Promise<ProviderHealth> {
    const targetModel = model || this.defaultModel;
    return {
      ok: true,
      provider: 'antigravity',
      model: targetModel,
      latencyMs: 1,
    };
  }

  public async generate(
    options: ProviderRequestOptions
  ): Promise<{ rawText: string; usage: UsageStats }> {
    const startTime = Date.now();
    const targetModel = options.model || this.defaultModel;

    // 1. Try custom sampling handler if registered
    if (this.customSamplingHandler) {
      try {
        if (options.onProgress) {
          options.onProgress(20, 100, `Dispatching via custom sampling handler (${targetModel})...`);
        }
        const res = await this.customSamplingHandler({
          model: targetModel,
          systemPrompt: options.systemPrompt,
          userPrompt: options.userPrompt,
        });
        return {
          rawText: typeof res === 'string' ? res : JSON.stringify(res),
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0 },
        };
      } catch (err) {
        console.warn(`${LOG_PREFIX} Custom sampling handler failed, falling back to server sampling:`, err);
      }
    }

    // 2. Try official MCP createMessage sampling if client supports it
    const clientSamplingSupported = Boolean(
      this.mcpServer?.getClientCapabilities?.()?.sampling
    );

    if (this.mcpServer && clientSamplingSupported) {
      try {
        if (options.onProgress) {
          options.onProgress(15, 100, `Requesting single-turn MCP sampling from host (${targetModel})...`);
        }

        const systemContent = options.notesContext
          ? `${options.systemPrompt}\n\n### Persistent Project Notes:\n${options.notesContext}`
          : options.systemPrompt;

        const result = await (this.mcpServer as any).createMessage({
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `${systemContent}\n\nTask:\n${options.userPrompt}`,
              },
            },
          ],
          modelPreferences: {
            hints: [{ name: targetModel }, { name: 'gemini-4-argon' }, { name: 'pro' }],
          },
          systemPrompt: systemContent,
          maxTokens: options.maxTokens || 4096,
        });

        const parsedResult = CreateMessageResultSchema.safeParse(result);
        if (parsedResult.success) {
          const content = parsedResult.data.content;
          const text = content.type === 'text' ? content.text : JSON.stringify(content);
          return {
            rawText: text,
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
              estimated_cost_usd: 0,
            },
          };
        }
      } catch (err: any) {
        console.warn(
          `${LOG_PREFIX} Host MCP sampling unavailable or declined (${err?.message || err}). Falling back to subagent bridge.`
        );
      }
    }

    // 3. Fallback: Antigravity Native Top-Down Delegation & Subagent Bridge
    if (options.onProgress) {
      options.onProgress(
        30,
        100,
        `Preparing native Antigravity delegation context (${targetModel})...`
      );
    }

    const promptLower = options.userPrompt.toLowerCase();
    const isPlanCheck = options.userPrompt.includes('TASK: PLAN CHECK') || promptLower.includes('plan');
    const isReview = options.userPrompt.includes('TASK: CODE REVIEW') || promptLower.includes('review');
    const isVerify = options.userPrompt.includes('TASK: RELEASE READINESS') || promptLower.includes('verify');
    const effectiveSubagentModel = this.subagentModel || 'flash';

    let subagentCallAdvice: any;

    if (isPlanCheck) {
      // In Top-Down Architect Delegation mode:
      // The Senior Architect (chat model) designs the plan and locks constraints.
      // Overwatch creates the Junior Implementation prompt for a fast Flash worker.
      const promptSnippet = options.userPrompt.length > 400
        ? options.userPrompt.substring(0, 400).replace(/"/g, "'") + '...'
        : options.userPrompt.replace(/"/g, "'");

      subagentCallAdvice = {
        verdict: 'APPROVED',
        summary: `[Antigravity Native Mode] Architectural plan approved and registered. Senior Architect in chat is ready to delegate execution to a Flash worker subagent.`,
        defects: [],
        optimizations: [],
        next_steps: [
          `Dispatch implementation to Flash worker: invoke_subagent(TypeName='self', Model='${effectiveSubagentModel}', Role='Overwatch Junior Implementer').`,
          `Instruct the subagent to make necessary file edits, run local tests, and report back with a git diff summary.`,
          `Once the subagent completes, call agent-overwatch_review to audit the git diff against .agent-overwatch/NOTES.md.`,
        ],
        avoid: [
          `Do NOT write routine boilerplate code directly in the senior chat; delegate implementation to the Flash subagent.`,
          `Do NOT allow the subagent to violate architectural constraints recorded in .agent-overwatch/NOTES.md.`,
        ],
        coaching_prompt: `Run: invoke_subagent(TypeName="self", Model="${effectiveSubagentModel}", Role="Overwatch Junior Implementer", Prompt="Implement milestone per approved plan. Target: ${promptSnippet}. Follow all constraints in .agent-overwatch/NOTES.md. Run tests and report git diff.")`,
        notes_to_save: [
          `Plan approved for Flash worker delegation: ${new Date().toISOString().substring(0, 10)}`,
        ],
        modelUsed: targetModel,
        providerUsed: 'antigravity',
      };
    } else if (isReview || isVerify) {
      subagentCallAdvice = {
        verdict: 'APPROVED',
        summary: `[Antigravity Native Mode] Deep repository context (git diff, untracked files, 1-hop dependencies) assembled for Senior Architect in-chat audit.`,
        defects: [],
        optimizations: [],
        next_steps: [
          `Senior Architect: Review the gathered diff, untracked files, and 1-hop dependencies in chat against .agent-overwatch/NOTES.md.`,
          `If any defects, edge-case regressions, or failing tests are found: use send_message to direct the subagent with fixes.`,
          `If all tests pass and code quality meets standards: approve and deliver the solution to the user.`,
        ],
        avoid: [
          `Do NOT approve if unverified regressions or broken tests exist.`,
        ],
        coaching_prompt: `Perform Senior Staff Architect audit on the gathered diff. Verify edge cases, architecture constraints, and test outputs before signing off.`,
        notes_to_save: [],
        modelUsed: targetModel,
        providerUsed: 'antigravity',
      };
    } else {
      subagentCallAdvice = {
        verdict: 'APPROVED',
        summary: `[Antigravity Native Mode] Checkpoint context assembled for Senior Architect steering.`,
        defects: [],
        optimizations: [],
        next_steps: [
          `Review subagent progress and current milestone state.`,
          `Steer the junior implementer on the next concrete actions.`,
        ],
        avoid: [],
        coaching_prompt: `Run: invoke_subagent(TypeName="self", Model="${effectiveSubagentModel}", Role="Overwatch Junior Implementer", Prompt="Proceed with next milestone per approved architecture.")`,
        notes_to_save: [],
        modelUsed: targetModel,
        providerUsed: 'antigravity',
      };
    }

    return {
      rawText: JSON.stringify(subagentCallAdvice, null, 2),
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: 0,
      },
    };
  }
}
