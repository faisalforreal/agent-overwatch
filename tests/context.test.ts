import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isPathSafe, readFileSafely, gatherRelevantFiles } from '../src/context/files.js';
import { appendRepoNotes, readRepoNotes, compactNotesContent } from '../src/context/notes.js';
import {
  checkBudget,
  recordCallUsage,
  resetSessionCallCount,
  loadStoredUsage,
} from '../src/budget/tracker.js';

describe('Context, Notes, and Budget Guard', () => {
  const tmpRepo = path.join(os.tmpdir(), `overwatch-ctx-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpRepo, { recursive: true });
    resetSessionCallCount();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it('blocks path traversal attempts outside repo_path', () => {
    expect(isPathSafe(tmpRepo, 'src/index.ts')).toBe(true);
    expect(isPathSafe(tmpRepo, '../../etc/passwd')).toBe(false);
    expect(isPathSafe(tmpRepo, '../sibling/file.txt')).toBe(false);
  });

  it('safely reads files and skips sensitive files', () => {
    fs.writeFileSync(path.join(tmpRepo, 'safe.txt'), 'hello world', 'utf-8');
    fs.writeFileSync(path.join(tmpRepo, '.env'), 'SECRET=12345', 'utf-8');

    const safeItem = readFileSafely(tmpRepo, 'safe.txt');
    expect(safeItem).not.toBeNull();
    expect(safeItem?.content).toBe('hello world');

    const envItem = readFileSafely(tmpRepo, '.env');
    expect(envItem).toBeNull(); // Skipped sensitive file
  });

  it('appends and reads shared notes in repo', () => {
    appendRepoNotes(tmpRepo, ['Decided to use PostgreSQL for relational integrity']);
    appendRepoNotes(tmpRepo, ['Rejected MongoDB due to lack of multi-table ACID transactions']);

    const notes = readRepoNotes(tmpRepo);
    expect(notes).toContain('PostgreSQL');
    expect(notes).toContain('Rejected MongoDB');
  });

  it('compacts oversized notes while preserving header and recent items', () => {
    let huge = '# Intro\n';
    for (let i = 0; i < 500; i++) {
      huge += `- Decision item number ${i}: detailed rationale and architectural constraints here.\n`;
    }

    const compacted = compactNotesContent(huge, 1024); // Cap at 1KB for test
    expect(compacted).toContain('# Intro');
    expect(compacted).toContain('Earlier decisions compacted');
    expect(compacted.length).toBeLessThan(huge.length);
  });

  it('enforces session call cap budget', () => {
    const maxCalls = 3;
    expect(checkBudget(maxCalls).allowed).toBe(true);

    recordCallUsage(tmpRepo, 'tutor_review', 'claude-opus-5');
    expect(checkBudget(maxCalls).allowed).toBe(true);
    expect(checkBudget(maxCalls).remainingCalls).toBe(2);

    recordCallUsage(tmpRepo, 'tutor_checkpoint', 'claude-opus-5');
    recordCallUsage(tmpRepo, 'tutor_verify', 'claude-opus-5');

    const check = checkBudget(maxCalls);
    expect(check.allowed).toBe(false);
    expect(check.message).toContain('call cap of 3 calls reached');
  });

  it('persists usage history and spend tracking', () => {
    recordCallUsage(tmpRepo, 'overwatch_review', 'claude-opus-5', {
      prompt_tokens: 1000,
      completion_tokens: 200,
      total_tokens: 1200,
      estimated_cost_usd: 0.03,
    });

    const stored = loadStoredUsage(tmpRepo);
    expect(stored.totalCalls).toBe(1);
    expect(stored.totalTokens).toBe(1200);
    expect(stored.totalSpendUsd).toBe(0.03);
    expect(stored.history.length).toBe(1);
    expect(stored.history[0].tool).toBe('overwatch_review');
  });
});
