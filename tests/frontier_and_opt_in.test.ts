import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AntigravityProvider } from '../src/providers/antigravity.js';
import { installForClient, getClientPaths } from '../src/clients/installer.js';
import { createOverwatchServer } from '../src/server.js';
import { resolveConfig } from '../src/config.js';
import { APP_NAME, TOOL_PLAN_CHECK, TOOL_STATUS } from '../src/constants.js';

describe('Frontier Models & Opt-In Architecture Suite', () => {
  const tmpHome = path.join(os.tmpdir(), `overwatch-frontier-home-${Date.now()}`);
  const tmpWs = path.join(os.tmpdir(), `overwatch-frontier-ws-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpWs, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpWs, { recursive: true, force: true });
  });

  describe('Antigravity Native Frontier Provider', () => {
    it('uses MCP sampling createMessage when mcpServer supports sampling', async () => {
      const mockServer = {
        getClientCapabilities: vi.fn().mockReturnValue({ sampling: {} }),
        createMessage: vi.fn().mockResolvedValue({
          role: 'assistant',
          content: {
            type: 'text',
            text: JSON.stringify({
              verdict: 'APPROVED',
              critique: 'Native sampling review passed cleanly.',
              score: 95,
            }),
          },
        }),
      };

      const provider = new AntigravityProvider({ mcpServer: mockServer as any });
      const res = await provider.generate({
        systemPrompt: 'You are senior mentor.',
        userPrompt: 'Evaluate plan',
        model: 'gemini-4-argon',
      });

      expect(mockServer.createMessage).toHaveBeenCalled();
      expect(res.rawText).toContain('APPROVED');
      expect(res.usage).toBeDefined();
    });

    it('falls back to 1-turn subagent bridge when sampling is unavailable', async () => {
      const provider = new AntigravityProvider({ mcpServer: undefined });
      const res = await provider.generate({
        systemPrompt: 'You are a senior staff engineer.',
        userPrompt: 'Check plan edge cases',
        model: 'gemini-4-argon',
      });

      expect(res.rawText).toContain('APPROVED');
      expect(res.rawText).toContain('[Antigravity Native Mode]');
      const parsed = JSON.parse(res.rawText);
      expect(parsed.verdict).toBe('APPROVED');
      expect(parsed.coaching_prompt).toContain('invoke_subagent');
    });
  });

  describe('Opt-In Rule Installation Behavior', () => {
    it('does NOT write rules to AGENTS.md when alwaysOnRules is false', () => {
      const res = installForClient('antigravity', {
        customHome: tmpHome,
        workspaceRoot: tmpWs,
        alwaysOnRules: false,
      });

      expect(res.status).toBe('installed');
      const paths = getClientPaths('antigravity', tmpHome, tmpWs);
      // MCP config and Skill should exist
      expect(fs.existsSync(paths.mcpConfigPath!)).toBe(true);
      expect(fs.existsSync(paths.skillInstallPath!)).toBe(true);
      // Global AGENTS.md rules should NOT be written
      expect(fs.existsSync(paths.rulesPath!)).toBe(false);
    });

    it('writes rules to AGENTS.md when alwaysOnRules is true', () => {
      const res = installForClient('antigravity', {
        customHome: tmpHome,
        workspaceRoot: tmpWs,
        alwaysOnRules: true,
      });

      expect(res.status).toBe('installed');
      const paths = getClientPaths('antigravity', tmpHome, tmpWs);
      expect(fs.existsSync(paths.rulesPath!)).toBe(true);
      const content = fs.readFileSync(paths.rulesPath!, 'utf-8');
      expect(content).toContain(`BEGIN ${APP_NAME.toUpperCase()} RULES`);
    });
  });

  describe('OVERWATCH_ENABLED Switch', () => {
    it('immediately bypasses checks with APPROVED verdict when config.enabled is false', async () => {
      const config = resolveConfig();
      config.enabled = false;

      const { server } = createOverwatchServer({ config });

      const handlers = (server as any)._requestHandlers;
      const callToolHandler = handlers.get('tools/call');
      expect(callToolHandler).toBeDefined();

      const response = await callToolHandler({
        method: 'tools/call',
        params: {
          name: TOOL_PLAN_CHECK,
          arguments: {
            user_goal: 'Build feature',
            proposed_plan: 'Plan step 1, 2, 3',
          },
        },
      });

      expect(response.content).toBeDefined();
      expect(response.content[0].text).toContain('Oversight is currently disabled');
      const feedback = JSON.parse(response.content[1].text);
      expect(feedback.verdict).toBe('APPROVED');
      expect(feedback.score).toBe(100);
    });
  });
});
