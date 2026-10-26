import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createOverwatchServer } from '../src/server.js';
import { MockProvider } from '../src/providers/mock.js';
import { resolveConfig } from '../src/config.js';

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

    expect(toolNames).toContain('overwatch_plan_check');
    expect(toolNames).toContain('overwatch_checkpoint');
    expect(toolNames).toContain('overwatch_review');
    expect(toolNames).toContain('overwatch_quick_hint');
    expect(toolNames).toContain('overwatch_verify');
    expect(toolNames).toContain('overwatch_status');

    // 2. Call overwatch_status tool
    const statusCallResult = await client.callTool({
      name: 'overwatch_status',
      arguments: {},
    });

    expect(statusCallResult.content).toBeDefined();
    expect(Array.isArray(statusCallResult.content)).toBe(true);
    const contentText = (statusCallResult.content as any[])[0].text;
    expect(contentText).toContain('Overwatch System Status');

    // 3. Call overwatch_plan_check tool
    const planCheckResult = await client.callTool({
      name: 'overwatch_plan_check',
      arguments: {
        user_goal: 'Create an e-commerce cart',
        proposed_plan: '1. Model Cart and CartItem\n2. Add CartService',
      },
    });

    const planText = (planCheckResult.content as any[])[0].text;
    expect(planText).toContain('Overwatch Verdict');

    await client.close();
    await server.close();
  });
});
