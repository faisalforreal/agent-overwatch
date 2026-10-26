import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  APP_NAME,
  BIN_NAME,
  CONFIG_DIR_NAME,
  TOOL_PLAN_CHECK,
  TOOL_CHECKPOINT,
  TOOL_REVIEW,
  TOOL_QUICK_HINT,
  TOOL_VERIFY,
  TOOL_STATUS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TOOL_TIMEOUTS,
} from '../src/constants.js';
import { getModelDefaults, estimateModelCost } from '../src/tiers.js';
import { resolveConfig } from '../src/config.js';
import { executeQuickHint } from '../src/tools/quick_hint.js';
import { executePlanCheck } from '../src/tools/plan_check.js';
import { executeStatus } from '../src/tools/status.js';
import { loadStoredUsage, resetSessionCallCount } from '../src/budget/tracker.js';
import { MockProvider } from '../src/providers/mock.js';
import { ProviderRouter } from '../src/providers/router.js';
import { getClientPaths } from '../src/clients/installer.js';

describe('Audit Fixes & Single-Source-of-Truth Verification', () => {
  let tmpRepo: string;

  beforeEach(() => {
    resetSessionCallCount();
    tmpRepo = path.join(os.tmpdir(), `overwatch-audit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpRepo, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpRepo)) {
        fs.rmSync(tmpRepo, { recursive: true, force: true });
      }
    } catch {}
  });

  it('verifies tool names and config directories derive strictly from APP_NAME', () => {
    expect(TOOL_PLAN_CHECK).toBe(`${APP_NAME}_plan_check`);
    expect(TOOL_CHECKPOINT).toBe(`${APP_NAME}_checkpoint`);
    expect(TOOL_REVIEW).toBe(`${APP_NAME}_review`);
    expect(TOOL_QUICK_HINT).toBe(`${APP_NAME}_quick_hint`);
    expect(TOOL_VERIFY).toBe(`${APP_NAME}_verify`);
    expect(TOOL_STATUS).toBe(`${APP_NAME}_status`);
    expect(CONFIG_DIR_NAME).toBe(`.${APP_NAME}`);
  });

  it('loads seed defaults from models.json without hardcoded fallbacks', () => {
    const defaults = getModelDefaults();
    expect(defaults.junior).toBe('gemini-2.0-flash');
    expect(defaults.mentor).toBe('claude-3-opus-20240229');
    expect(defaults.providerDefaults?.anthropic).toBe('claude-3-opus-20240229');
    expect(defaults.providerDefaults?.openai).toBe('o3-mini');
    expect(defaults.providerDefaults?.gemini).toBe('gemini-2.0-pro-exp-02-05');
  });

  it('calculates dynamic token spend using models.json pricing', () => {
    // Claude 3 Opus: $15/M input, $75/M output
    const opusCost = estimateModelCost('claude-3-opus-20240229', 1_000_000, 1_000_000);
    expect(opusCost).toBe(90.0);

    // Gemini 2.0 Flash: $0.1/M input, $0.4/M output
    const flashCost = estimateModelCost('gemini-2.0-flash', 1_000_000, 1_000_000);
    expect(flashCost).toBe(0.5);

    // o3-mini: $1.1/M input, $4.4/M output
    const o3Cost = estimateModelCost('o3-mini', 1_000_000, 1_000_000);
    expect(o3Cost).toBe(5.5);
  });

  it('executes quick_hint and persists usage to usage.json even when repo_path is omitted', async () => {
    const config = resolveConfig();
    const mockProvider = new MockProvider();
    const router = new ProviderRouter(config, mockProvider);

    // Call quick_hint without passing repoPath (omitted)
    const res = await executeQuickHint(
      {
        problem_description: 'Cannot connect to database in test environment',
        error_or_log: 'ECONNREFUSED 127.0.0.1:5432',
      },
      router,
      tmpRepo // Pass tmpRepo as target
    );

    expect(res.feedback.verdict).toBeDefined();

    // Verify usage.json was written in tmpRepo
    const stored = loadStoredUsage(tmpRepo);
    expect(stored.totalCalls).toBe(1);
    expect(stored.history.length).toBe(1);
    expect(stored.history[0].tool).toBe(TOOL_QUICK_HINT);
  });

  it('executes plan_check with omitted repo_path falling back to process.cwd() gracefully', async () => {
    const config = resolveConfig();
    const mockProvider = new MockProvider();
    const router = new ProviderRouter(config, mockProvider);

    // Call plan_check without repo_path
    const res = await executePlanCheck(
      {
        user_goal: 'Add caching middleware',
        proposed_plan: '1. Create cache helper\n2. Integrate in router',
      },
      router
    );

    expect(res.feedback.verdict).toBeDefined();
    expect(res.markdown).toContain('Verdict');
  });

  it('verifies 180s default timeout and tool-specific timeout configurations', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(180000);
    expect(DEFAULT_TOOL_TIMEOUTS[TOOL_PLAN_CHECK]).toBe(180000);
    expect(DEFAULT_TOOL_TIMEOUTS[TOOL_VERIFY]).toBe(180000);
    expect(DEFAULT_TOOL_TIMEOUTS[TOOL_REVIEW]).toBe(120000);
    expect(DEFAULT_TOOL_TIMEOUTS[TOOL_CHECKPOINT]).toBe(90000);
    expect(DEFAULT_TOOL_TIMEOUTS[TOOL_QUICK_HINT]).toBe(45000);
  });

  it('verifies client paths for all 6 supported clients including codex', () => {
    const antigravity = getClientPaths('antigravity', '/test/home', '/test/ws');
    expect(antigravity.mcpConfigPath).toBe('/test/home/.gemini/config/mcp_config.json');

    const claude = getClientPaths('claude_code', '/test/home', '/test/ws');
    expect(claude.mcpConfigPath).toBe('/test/home/.claude.json');

    const cursor = getClientPaths('cursor', '/test/home', '/test/ws');
    expect(cursor.rulesPath).toBe(`/test/ws/.cursor/rules/${APP_NAME}.mdc`);

    const windsurf = getClientPaths('windsurf', '/test/home', '/test/ws');
    expect(windsurf.rulesPath).toBe(`/test/ws/.windsurf/rules/${APP_NAME}.md`);

    const vscode = getClientPaths('vscode', '/test/home', '/test/ws');
    expect(vscode.rulesPath).toBe('/test/ws/.clinerules');

    const codex = getClientPaths('codex', '/test/home', '/test/ws');
    expect(codex.mcpConfigPath).toBe('/test/home/.codex/config.toml');
    expect(codex.rulesPath).toBe('/test/ws/AGENTS.md');
  });
});
