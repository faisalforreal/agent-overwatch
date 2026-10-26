import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  APP_NAME,
  LOG_PREFIX,
  TOOL_PLAN_CHECK,
  TOOL_CHECKPOINT,
  TOOL_REVIEW,
  TOOL_QUICK_HINT,
  TOOL_VERIFY,
  TOOL_STATUS,
  DEFAULT_TOOL_TIMEOUTS,
} from './constants.js';
import { resolveConfig, OverwatchConfig } from './config.js';
import { ProviderRouter } from './providers/router.js';
import { MockProvider } from './providers/mock.js';
import { ProgressCallback } from './providers/base.js';
import {
  OverwatchPlanCheckInputSchema,
  OverwatchCheckpointInputSchema,
  OverwatchReviewInputSchema,
  OverwatchQuickHintInputSchema,
  OverwatchVerifyInputSchema,
  OverwatchStatusInputSchema,
} from './types.js';
import {
  executePlanCheck,
  executeCheckpoint,
  executeReview,
  executeQuickHint,
  executeVerify,
  executeStatus,
} from './tools/index.js';

export interface CreateServerOptions {
  config?: OverwatchConfig;
  mockProvider?: MockProvider;
}

export function createOverwatchServer(options: CreateServerOptions = {}): {
  server: Server;
  router: ProviderRouter;
  config: OverwatchConfig;
} {
  const config = options.config || resolveConfig();
  const router = new ProviderRouter(config, options.mockProvider);

  const server = new Server(
    {
      name: APP_NAME,
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: TOOL_PLAN_CHECK,
          description:
            'MANDATORY pre-implementation gate: Senior architect evaluates proposed plan against user goal, edge cases, and repo architecture before code is written.',
          inputSchema: {
            type: 'object',
            properties: {
              user_goal: {
                type: 'string',
                description: 'The primary task or prompt from the user',
              },
              proposed_plan: {
                type: 'string',
                description: 'The detailed plan drafted by the junior agent',
              },
              repo_path: {
                type: 'string',
                description: 'Absolute path to repository root for context gathering',
              },
              relevant_files: {
                type: 'array',
                items: { type: 'string' },
                description: 'Relevant relative file paths suggested by junior agent',
              },
              architecture_context: {
                type: 'string',
                description: 'Notes on framework, dependencies, or system constraints',
              },
            },
            required: ['user_goal', 'proposed_plan'],
          },
        },
        {
          name: TOOL_CHECKPOINT,
          description:
            'MANDATORY steering gate: Evaluates progress after every major milestone and after 2 consecutive failures. Inspects git diff and dictates the next 3-5 concrete steps and avoid list.',
          inputSchema: {
            type: 'object',
            properties: {
              user_goal: {
                type: 'string',
                description: 'The primary task or prompt from the user',
              },
              state: {
                type: 'object',
                properties: {
                  done: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Completed milestones so far',
                  },
                  failing: {
                    type: 'string',
                    description: 'Current failure or error if any',
                  },
                  about_to_do: {
                    type: 'string',
                    description: 'The next step the junior agent is about to execute',
                  },
                },
                required: ['done', 'about_to_do'],
              },
              repo_path: {
                type: 'string',
                description: 'Absolute path to repository root for automatic diff check',
              },
              error_log: {
                type: 'string',
                description: 'Compiler, test, or runtime error log',
              },
            },
            required: ['user_goal', 'state'],
          },
        },
        {
          name: TOOL_REVIEW,
          description:
            'Full code review of real git diff or draft code: detects logic defects, race conditions, edge cases, and provides actionable coaching prompts.',
          inputSchema: {
            type: 'object',
            properties: {
              user_goal: {
                type: 'string',
                description: 'The primary task or prompt from the user',
              },
              repo_path: {
                type: 'string',
                description: 'Absolute path to repository root (preferred; server reads real git diff)',
              },
              draft_code_or_diff: {
                type: 'string',
                description: 'Manual code or diff snippet if repo_path is not available',
              },
              file_context: {
                type: 'string',
                description: 'Additional context or file snippets',
              },
              current_tests_or_errors: {
                type: 'string',
                description: 'Test execution outputs or errors',
              },
              mentor_model: {
                type: 'string',
                description: 'Optional per-call override for mentor model (must pass tier check)',
              },
            },
            required: ['user_goal'],
          },
        },
        {
          name: TOOL_QUICK_HINT,
          description:
            'Targeted diagnosis to break out of debug loops when junior model is stuck on a compiler error or test failure.',
          inputSchema: {
            type: 'object',
            properties: {
              problem_description: {
                type: 'string',
                description: 'Brief description of where the agent is stuck',
              },
              error_or_log: {
                type: 'string',
                description: 'The exact error message, stack trace, or compiler error',
              },
              attempted_fix: {
                type: 'string',
                description: 'What the junior agent tried and why it failed',
              },
              repo_path: {
                type: 'string',
                description: 'Absolute path to repository root for tracking and context',
              },
            },
            required: ['problem_description', 'error_or_log'],
          },
        },
        {
          name: TOOL_VERIFY,
          description:
            'MANDATORY completion gate: Audits total git diff against base ref and verifies test suite results before declaring task done.',
          inputSchema: {
            type: 'object',
            properties: {
              user_goal: {
                type: 'string',
                description: 'The primary task or prompt from the user',
              },
              repo_path: {
                type: 'string',
                description: 'Absolute path to repository root to inspect real git diff',
              },
              base_ref: {
                type: 'string',
                description: 'Git base reference to diff against (defaults to HEAD~1)',
              },
              test_results: {
                type: 'string',
                description: 'Console output of test suite execution',
              },
            },
            required: ['user_goal', 'repo_path'],
          },
        },
        {
          name: TOOL_STATUS,
          description:
            'Inspects configured junior and mentor models, tier validation result, provider health and latency ping, and session call budget.',
          inputSchema: {
            type: 'object',
            properties: {
              repo_path: {
                type: 'string',
                description: 'Repository path to check local notes and session budget',
              },
            },
          },
        },
      ],
    };
  });

  // Call tool handler with progress keep-alive & structured timeout handling
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args, _meta } = request.params;
    const progressToken = _meta?.progressToken;

    // Build Progress & Keep-Alive Dispatcher
    const onProgress: ProgressCallback = (progress, total, message) => {
      // 1. Emit official MCP progress notification if client sent progressToken
      if (progressToken !== undefined) {
        server.notification({
          method: 'notifications/progress',
          params: {
            progressToken,
            progress,
            total: total || 100,
            message,
          },
        }).catch(() => {});
      }

      // 2. Emit MCP logging keep-alive so connection remains active
      if (message) {
        server.sendLoggingMessage({
          level: 'info',
          data: `[${APP_NAME}] ${message}`,
        }).catch(() => {});
      }
    };

    try {
      if (name === TOOL_PLAN_CHECK) {
        const input = OverwatchPlanCheckInputSchema.parse(args);
        const timeoutMs =
          config.toolTimeouts[TOOL_PLAN_CHECK] ||
          DEFAULT_TOOL_TIMEOUTS[TOOL_PLAN_CHECK] ||
          180000;
        const { feedback, markdown } = await executePlanCheck(
          input,
          router,
          config.maxCallsPerSession,
          onProgress,
          timeoutMs
        );
        return {
          content: [
            { type: 'text', text: markdown },
            { type: 'text', text: JSON.stringify(feedback) },
          ],
        };
      }

      if (name === TOOL_CHECKPOINT) {
        const input = OverwatchCheckpointInputSchema.parse(args);
        const timeoutMs =
          config.toolTimeouts[TOOL_CHECKPOINT] ||
          DEFAULT_TOOL_TIMEOUTS[TOOL_CHECKPOINT] ||
          90000;
        const { feedback, markdown } = await executeCheckpoint(
          input,
          router,
          config.maxCallsPerSession,
          onProgress,
          timeoutMs
        );
        return {
          content: [
            { type: 'text', text: markdown },
            { type: 'text', text: JSON.stringify(feedback) },
          ],
        };
      }

      if (name === TOOL_REVIEW) {
        const input = OverwatchReviewInputSchema.parse(args);
        const timeoutMs =
          config.toolTimeouts[TOOL_REVIEW] ||
          DEFAULT_TOOL_TIMEOUTS[TOOL_REVIEW] ||
          120000;
        const { feedback, markdown } = await executeReview(
          input,
          router,
          config.juniorModel,
          config.maxCallsPerSession,
          onProgress,
          timeoutMs
        );
        return {
          content: [
            { type: 'text', text: markdown },
            { type: 'text', text: JSON.stringify(feedback) },
          ],
        };
      }

      if (name === TOOL_QUICK_HINT) {
        const input = OverwatchQuickHintInputSchema.parse(args);
        const timeoutMs =
          config.toolTimeouts[TOOL_QUICK_HINT] ||
          DEFAULT_TOOL_TIMEOUTS[TOOL_QUICK_HINT] ||
          45000;
        const repoPath = input.repo_path || process.cwd();
        const { feedback, markdown } = await executeQuickHint(
          input,
          router,
          repoPath,
          config.maxCallsPerSession,
          onProgress,
          timeoutMs
        );
        return {
          content: [
            { type: 'text', text: markdown },
            { type: 'text', text: JSON.stringify(feedback) },
          ],
        };
      }

      if (name === TOOL_VERIFY) {
        const input = OverwatchVerifyInputSchema.parse(args);
        const timeoutMs =
          config.toolTimeouts[TOOL_VERIFY] ||
          DEFAULT_TOOL_TIMEOUTS[TOOL_VERIFY] ||
          180000;
        const { feedback, markdown } = await executeVerify(
          input,
          router,
          config.maxCallsPerSession,
          onProgress,
          timeoutMs
        );
        return {
          content: [
            { type: 'text', text: markdown },
            { type: 'text', text: JSON.stringify(feedback) },
          ],
        };
      }

      if (name === TOOL_STATUS) {
        const input = OverwatchStatusInputSchema.parse(args || {});
        const repoPath = input.repo_path || process.cwd();
        const { status, markdown } = await executeStatus(
          config,
          router,
          repoPath
        );
        return {
          content: [
            { type: 'text', text: markdown },
            { type: 'text', text: JSON.stringify(status) },
          ],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (err: any) {
      console.error(`${LOG_PREFIX} Error executing tool '${name}':`, err);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Tool Execution Error in '${name}': ${err?.message || String(err)}`,
          },
        ],
      };
    }
  });

  return { server, router, config };
}

export async function runServer(): Promise<void> {
  const { server } = createOverwatchServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${APP_NAME}] Stdio MCP server connected and listening.`);
}
