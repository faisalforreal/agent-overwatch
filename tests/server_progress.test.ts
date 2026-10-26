import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ProgressNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { createOverwatchServer } from '../src/server.js';
import { MockProvider } from '../src/providers/mock.js';
import { resolveConfig } from '../src/config.js';

describe('MCP Server Progress Notifications & Keep-Alive Suite', () => {
  it('delivers notifications/progress when client passes progressToken', async () => {
    const config = resolveConfig();
    const mock = new MockProvider();

    const { server } = createOverwatchServer({ config, mockProvider: mock });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    const receivedProgress: any[] = [];
    client.setNotificationHandler(ProgressNotificationSchema, (notif) => {
      receivedProgress.push(notif.params);
    });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    // Call tool with progressToken in _meta
    const res = await client.callTool({
      name: 'overwatch_plan_check',
      arguments: {
        user_goal: 'Implement token auth',
        proposed_plan: '1. Add jwt\n2. Add test',
      },
      _meta: {
        progressToken: 'token-abc-123',
      },
    });

    expect(res.content).toBeDefined();

    // Verify client received progress notification
    expect(receivedProgress.length).toBeGreaterThan(0);
    const first = receivedProgress[0];
    expect(first.progressToken).toBe('token-abc-123');
    expect(first.progress).toBeDefined();

    await client.close();
    await server.close();
  });
});
