import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveConfig } from '../src/config.js';
import { ProviderRouter } from '../src/providers/router.js';
import { MockProvider } from '../src/providers/mock.js';
import {
  executePlanCheck,
  executeCheckpoint,
  executeReview,
  executeQuickHint,
  executeVerify,
  executeStatus,
} from '../src/tools/index.js';
import { resetSessionCallCount } from '../src/budget/tracker.js';

describe('MCP Tools Implementation Suite', () => {
  const tmpRepo = path.join(os.tmpdir(), `overwatch-tools-test-${Date.now()}`);
  let router: ProviderRouter;

  beforeEach(() => {
    fs.mkdirSync(tmpRepo, { recursive: true });
    resetSessionCallCount();
    const config = resolveConfig();
    const mock = new MockProvider();
    router = new ProviderRouter(config, mock);
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it('executes overwatch_plan_check and appends notes', async () => {
    const res = await executePlanCheck(
      {
        user_goal: 'Implement user authentication with JWT',
        proposed_plan: '1. Add bcrypt\n2. Add JWT signing\n3. Add auth middleware',
        repo_path: tmpRepo,
      },
      router
    );

    expect(res.feedback.verdict).toBe('APPROVED');
    expect(res.markdown).toContain('Overwatch Verdict');
    expect(res.markdown).toContain('APPROVED');
  });

  it('executes overwatch_checkpoint and provides steering steps', async () => {
    const res = await executeCheckpoint(
      {
        user_goal: 'Implement user authentication',
        state: {
          done: ['Added password hashing'],
          about_to_do: 'Create login endpoint',
        },
        repo_path: tmpRepo,
      },
      router
    );

    expect(res.feedback.next_steps.length).toBeGreaterThan(0);
    expect(res.feedback.avoid.length).toBeGreaterThan(0);
  });

  it('executes overwatch_review with real diff or manual draft', async () => {
    const res = await executeReview(
      {
        user_goal: 'Add helper function',
        draft_code_or_diff: 'function add(a, b) { return a + b; }',
      },
      router
    );

    expect(res.feedback.verdict).toBe('APPROVED');
  });

  it('executes overwatch_quick_hint for debugging assistance', async () => {
    const res = await executeQuickHint(
      {
        problem_description: 'TypeScript error TS2307 cannot find module',
        error_or_log: 'error TS2307: Cannot find module ./foo.js',
      },
      router
    );

    expect(res.feedback.summary).toBeTruthy();
  });

  it('executes overwatch_verify for release readiness gate', async () => {
    const res = await executeVerify(
      {
        user_goal: 'Refactor auth',
        repo_path: tmpRepo,
        test_results: 'Tests: 12 passed, 0 failed',
      },
      router
    );

    expect(res.feedback.verdict).toBe('APPROVED');
  });

  it('executes overwatch_status and reports tier validation and budget', async () => {
    const config = resolveConfig();
    const res = await executeStatus(config, router, tmpRepo);

    expect(res.status.juniorModel).toBe(config.juniorModel);
    expect(res.status.tierValidation.valid).toBe(true);
    expect(res.status.sessionCalls).toBe(0);
    expect(res.markdown).toContain('🛰️ Overwatch System Status');
  });
});
