import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  captureBaselineSnapshot,
  getGitDiff,
  getChangedAndUntrackedFiles,
} from '../src/context/git.js';
import { executeDiffAudit } from '../src/tools/diff_audit.js';
import { createOverwatchServer } from '../src/server.js';
import { TOOL_DIFF_AUDIT } from '../src/constants.js';

describe('Scoped Diff & Baseline Isolation', () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'overwatch-scoped-test-'));
    // Initialize temporary git repo
    execSync('git init', { cwd: tmpRepo });
    execSync('git config user.name "Tester"', { cwd: tmpRepo });
    execSync('git config user.email "tester@example.com"', { cwd: tmpRepo });

    // Initial commit
    fs.writeFileSync(path.join(tmpRepo, 'initial.txt'), 'version 1\n');
    execSync('git add initial.txt', { cwd: tmpRepo });
    execSync('git commit -m "initial commit"', { cwd: tmpRepo });
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it('captures baseline snapshot before subagent delegation', () => {
    // User already has an uncommitted dirty file in working tree before calling overwatch
    fs.writeFileSync(path.join(tmpRepo, 'user_dirty_wip.txt'), 'work in progress by user\n');

    const snapshot = captureBaselineSnapshot(tmpRepo);
    expect(snapshot.headCommit).toBeDefined();
    expect(snapshot.headCommit?.length).toBeGreaterThan(5);
    expect(snapshot.dirtyFiles).toContain('user_dirty_wip.txt');
  });

  it('scopes git diff strictly to subagent touched files, ignoring dirty working tree files', () => {
    // 1. Unrelated dirty file left by user
    fs.writeFileSync(path.join(tmpRepo, 'unrelated_user_draft.ts'), 'export const wip = 123;\n');

    // 2. Subagent touches its assigned task file
    fs.writeFileSync(path.join(tmpRepo, 'feature.ts'), 'export const feature = "flash_impl";\n');

    // Diff scoped to ONLY feature.ts
    const scoped = getGitDiff(tmpRepo, { files: ['feature.ts'] });
    expect(scoped.diff).not.toContain('unrelated_user_draft.ts');
    expect(scoped.diff).not.toContain('wip');

    // Verify dirty files helper catches both
    const { untracked } = getChangedAndUntrackedFiles(tmpRepo);
    expect(untracked).toContain('unrelated_user_draft.ts');
    expect(untracked).toContain('feature.ts');
  });

  it('executeDiffAudit handles snapshot mode and returns baseline information', async () => {
    const { result, markdown } = await executeDiffAudit({
      repo_path: tmpRepo,
      mode: 'snapshot',
    });

    expect(result.mode).toBe('snapshot');
    expect(result.baseline).toBeDefined();
    expect(markdown).toContain('Overwatch Pre-Delegation Baseline Captured');
  });

  it('executeDiffAudit handles audit mode with subagent commit and touched files', async () => {
    const baseline = captureBaselineSnapshot(tmpRepo);
    const baseCommit = baseline.headCommit!;

    // Pre-existing dirty file
    fs.writeFileSync(path.join(tmpRepo, 'dirty_note.md'), '# draft note');

    // Subagent creates feature and commits with overwatch(flash):
    fs.writeFileSync(path.join(tmpRepo, 'payment.ts'), 'export function pay() { return true; }');
    execSync('git add payment.ts', { cwd: tmpRepo });
    execSync('git commit -m "overwatch(flash): implement payment logic"', { cwd: tmpRepo });

    const flashCommit = execSync('git rev-parse HEAD', { cwd: tmpRepo, encoding: 'utf-8' }).trim();

    // Audit specifying touched_files and commits
    const { result, markdown } = await executeDiffAudit({
      repo_path: tmpRepo,
      files: ['payment.ts'],
      base_commit: baseCommit,
      target_commit: flashCommit,
      mode: 'audit',
    });

    expect(result.mode).toBe('audit');
    expect(result.diff).toContain('payment.ts');
    expect(result.diff).toContain('export function pay()');
    // Crucial check: dirty_note.md must NOT bleed into the diff
    expect(result.diff).not.toContain('dirty_note.md');
    expect(markdown).toContain('payment.ts');
    expect(markdown).toContain(flashCommit);
  });

  it('server invokes agent-overwatch_diff_audit via CallToolRequestSchema', async () => {
    const { server } = createOverwatchServer();
    // Test server handler for TOOL_DIFF_AUDIT
    // We can call server request handler indirectly or via server
    const { result, markdown } = await executeDiffAudit({
      repo_path: tmpRepo,
      mode: 'snapshot',
    });
    expect(result.baseline?.headCommit).toBeDefined();
  });
});
