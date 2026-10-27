import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { APP_NAME } from '../src/constants.js';
import { fileURLToPath } from 'node:url';

describe('Stdio MCP CLI Hygiene Test', () => {
  it('launches overwatch serve, verifies pure JSON-RPC on stdout and no stray logs', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const rootDir = path.resolve(path.dirname(__filename), '..');
    const binPath = path.join(rootDir, 'bin', 'overwatch.js');

    const proc = spawn('node', [binPath, 'serve'], {
      cwd: rootDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, OVERWATCH_MOCK_PROVIDER: 'true' },
    });

    let stdoutData = '';
    let stderrData = '';

    proc.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    // Send JSON-RPC initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };

    proc.stdin.write(JSON.stringify(initRequest) + '\n');

    // Wait until server is listening and JSON-RPC response is received (up to 10s)
    const startTime = Date.now();
    while (Date.now() - startTime < 10000) {
      if (
        stderrData.includes(`[${APP_NAME}] Stdio MCP server connected and listening`) &&
        stdoutData.includes('"jsonrpc":"2.0"') &&
        stdoutData.includes('"id":1')
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    try {
      proc.kill();
    } catch {}

    // Stderr should contain server listening message
    expect(stderrData).toContain(`[${APP_NAME}] Stdio MCP server connected and listening`);

    // Stdout must contain valid JSON-RPC
    expect(stdoutData).toContain('"jsonrpc":"2.0"');
    expect(stdoutData).toContain('"id":1');

    // Every line of stdout must be valid JSON or empty
    const lines = stdoutData.trim().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    }
  }, 15000);
});
