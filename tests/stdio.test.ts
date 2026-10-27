import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createOverwatchServer } from '../src/server.js';
import { MockProvider } from '../src/providers/mock.js';
import { resolveConfig } from '../src/config.js';
import {
  APP_NAME,
  TOOL_PLAN_CHECK,
  TOOL_CHECKPOINT,
  TOOL_REVIEW,
  TOOL_QUICK_HINT,
  TOOL_VERIFY,
  TOOL_STATUS,
} from '../src/constants.js';

describe('MCP Server Protocol Handshake', () => {
  it('connects, lists tools, and executes tool calls over MCP transport', async () => {
    const config = resolveConfig();
    const mockProvider = new MockProvider();
    const { server } = createOverwatchServer({ config, mockProvider });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client(
      { name: 'test-junior-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    // 1. List tools
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name);

    expect(toolNames).toContain(TOOL_PLAN_CHECK);
    expect(toolNames).toContain(TOOL_CHECKPOINT);
    expect(toolNames).toContain(TOOL_REVIEW);
    expect(toolNames).toContain(TOOL_QUICK_HINT);
    expect(toolNames).toContain(TOOL_VERIFY);
    expect(toolNames).toContain(TOOL_STATUS);

    // 2. Call status tool
    const statusCallResult = await client.callTool({
      name: TOOL_STATUS,
      arguments: {},
    });

    expect(statusCallResult.content).toBeDefined();
    expect(Array.isArray(statusCallResult.content)).toBe(true);
    const contentText = (statusCallResult.content as any[])[0].text;
    const title = APP_NAME.charAt(0).toUpperCase() + APP_NAME.slice(1);
    expect(contentText).toContain(`${title} System Status`);

    // 3. Call plan_check tool
    const planCheckResult = await client.callTool({
      name: TOOL_PLAN_CHECK,
      arguments: {
        user_goal: 'Create an e-commerce cart',
        proposed_plan: '1. Model Cart and CartItem\n2. Add CartService',
      },
    });

    const planText = (planCheckResult.content as any[])[0].text;
    expect(planText).toContain(`${title} Verdict`);

    await client.close();
    await server.close();
  });
});
