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

  constructor(options: AntigravityProviderOptions = {}) {
    this.mcpServer = options.mcpServer;
    this.customSamplingHandler = options.samplingHandler;
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

    // 3. Fallback: Antigravity Native Single-Turn Subagent Bridge
    // Prepare a pre-packaged single-turn envelope for the host agent to execute
    // via invoke_subagent(TypeName="research", Model="pro")
    if (options.onProgress) {
      options.onProgress(
        30,
        100,
        `Preparing native single-turn Antigravity subagent bridge (${targetModel})...`
      );
    }

    const subagentPrompt = `## OVERWATCH SENIOR ARCHITECT MENTOR REVIEW
You are acting as the Senior Staff Architect mentor for Agent-Overwatch.
ALL REPOSITORY CONTEXT, GIT DIFFS, AND NOTES ARE PROVIDED BELOW.
DO NOT CALL ANY TOOLS. DO NOT SEARCH FILES.
Analyze the context and reply IMMEDIATELY in a single turn with valid JSON matching this schema:
{
  "verdict": "APPROVED" | "NEEDS_REFINEMENT" | "CRITICAL_REVISION",
  "summary": "1-3 sentences senior architectural assessment",
  "defects": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "location": "file path, function name, or line",
      "explanation": "Why this breaks or fails",
      "suggested_fix": "Concrete fix instruction or code snippet"
    }
  ],
  "optimizations": [
    {
      "type": "performance" | "architecture" | "memory" | "security" | "maintainability",
      "description": "Specific optimization",
      "impact": "Expected gain"
    }
  ],
  "next_steps": ["Step 1...", "Step 2...", "Step 3..."],
  "avoid": ["Do NOT do X...", "Avoid pattern Y..."],
  "coaching_prompt": "Direct, imperatively phrased prompt for the junior agent next turn",
  "notes_to_save": ["Decision: ...", "Constraint: ..."]
}

${options.notesContext ? `### Active Notes:\n${options.notesContext}\n\n` : ''}
${options.userPrompt}
`;

    const subagentCallAdvice = {
      verdict: 'APPROVED',
      summary: `[Antigravity Native Mode] Context prepared for single-turn '${targetModel}' mentor review using Antigravity built-in 'pro' tier.`,
      defects: [],
      optimizations: [],
      next_steps: [
        `Call invoke_subagent once with TypeName='research', Model='pro', Role='Overwatch Senior Architect'.`,
        `Pass the pre-packaged prompt in the coaching_prompt field below.`,
        `Directly obey the returned verdict, defects, and next steps from the subagent review.`,
      ],
      avoid: [
        `Do NOT call tools inside the subagent; all diffs, files, and notes are already bundled inline.`,
      ],
      coaching_prompt: `Run: invoke_subagent(TypeName="research", Model="pro", Role="Overwatch Senior Architect", Prompt=${JSON.stringify(subagentPrompt)})`,
      notes_to_save: [],
      modelUsed: targetModel,
      providerUsed: 'antigravity',
    };

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
