import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  getChangedAndUntrackedFiles,
  getRepoFileTree,
  getRecentGitLog,
} from '../src/context/git.js';
import {
  extractLocalImports,
  detectRelevantExistingFiles,
  gatherDeepRepoContext,
} from '../src/context/files.js';
import {
  synchronizeCatchUpContext,
  loadRepoState,
} from '../src/context/catchup.js';
import { readRepoNotes } from '../src/context/notes.js';

describe('Deep Context & Mid-Session Catch-Up Suite', () => {
  const tmpRepo = path.join(os.tmpdir(), `overwatch-deep-ctx-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpRepo, { recursive: true });
    // Initialize git repository
    execFileSync('git', ['init'], { cwd: tmpRepo });
    execFileSync('git', ['config', 'user.name', 'TestUser'], { cwd: tmpRepo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpRepo });

    // Initial files
    fs.mkdirSync(path.join(tmpRepo, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'types.ts'),
      'export interface UserConfig { id: string; role: string; }\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'helper.ts'),
      'export function getPrefix(): string { return "[PRE]"; }\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpRepo, 'package.json'),
      '{\n  "name": "test-repo",\n  "version": "1.0.0"\n}\n',
      'utf-8'
    );

    execFileSync('git', ['add', '.'], { cwd: tmpRepo });
    execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: tmpRepo });
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  describe('Git Context Enhancements', () => {
    it('accurately identifies both modified files and brand-new untracked files', () => {
      // Modify an existing tracked file
      fs.appendFileSync(path.join(tmpRepo, 'src', 'types.ts'), 'export type Role = "admin" | "user";\n');

      // Create a brand new untracked file
      fs.writeFileSync(path.join(tmpRepo, 'src', 'new_feature.ts'), 'console.log("untracked");\n');

      const { modified, untracked } = getChangedAndUntrackedFiles(tmpRepo);
      expect(modified).toContain('src/types.ts');
      expect(untracked).toContain('src/new_feature.ts');
    });

    it('generates a clean repository file tree excluding git files', () => {
      const tree = getRepoFileTree(tmpRepo);
      expect(tree).toContain('src/types.ts');
      expect(tree).toContain('src/helper.ts');
      expect(tree).toContain('package.json');
      expect(tree).not.toContain('.git');
    });

    it('retrieves recent git log and current HEAD commit', () => {
      const res = getRecentGitLog(tmpRepo);
      expect(res.headCommit).toBeDefined();
      expect(res.headCommit!.length).toBeGreaterThan(10);
      expect(res.log).toContain('Initial commit');
    });
  });

  describe('1-Hop Import Resolution & Existing File Auto-Detection', () => {
    it('extracts local imports and resolves ESM .js imports to .ts files on disk', () => {
      const mainContent = `
import { UserConfig } from './types.js';
import { getPrefix } from './helper.js';
console.log("main");
`;
      fs.writeFileSync(path.join(tmpRepo, 'src', 'main.ts'), mainContent, 'utf-8');

      const imports = extractLocalImports(tmpRepo, 'src/main.ts', mainContent);
      expect(imports).toContain('src/types.ts');
      expect(imports).toContain('src/helper.ts');
    });

    it('detects existing unchanged files mentioned in user goal or prompt text', () => {
      const promptText = 'Please update the authentication logic and check src/helper.ts and types.ts for constraints.';
      const detected = detectRelevantExistingFiles(tmpRepo, promptText);

      expect(detected).toContain('src/helper.ts');
      expect(detected).toContain('src/types.ts');
    });
  });

  describe('Deep Context Gathering Engine', () => {
    it('gathers existing relevant files, untracked files, modified files, and 1-hop dependencies', () => {
      // 1. Create a modified file that imports helper.ts
      const featureContent = `
import { getPrefix } from './helper.js';
export const feature = getPrefix() + " ACTIVE";
`;
      fs.writeFileSync(path.join(tmpRepo, 'src', 'feature.ts'), featureContent, 'utf-8');
      execFileSync('git', ['add', '.'], { cwd: tmpRepo });
      execFileSync('git', ['commit', '-m', 'Add feature'], { cwd: tmpRepo });

      // Modify feature.ts
      fs.appendFileSync(path.join(tmpRepo, 'src', 'feature.ts'), '\nexport const extra = 42;\n');

      // 2. Create brand-new untracked file
      fs.writeFileSync(path.join(tmpRepo, 'src', 'untracked.ts'), 'export const isNew = true;\n');

      const { modified, untracked } = getChangedAndUntrackedFiles(tmpRepo);

      const res = gatherDeepRepoContext(tmpRepo, {
        modifiedFiles: modified,
        untrackedFiles: untracked,
        textContext: 'We need to review the feature and also check types.ts',
      });

      // Untracked file must be included in full
      expect(res.combinedFormatted).toContain('src/untracked.ts');
      expect(res.combinedFormatted).toContain('isNew = true');

      // Modified file must be included in full
      expect(res.combinedFormatted).toContain('src/feature.ts');
      expect(res.combinedFormatted).toContain('extra = 42');

      // 1-Hop imported dependency (helper.ts) must be included even though unedited
      expect(res.combinedFormatted).toContain('src/helper.ts');
      expect(res.combinedFormatted).toContain('getPrefix');

      // Detected existing file (types.ts) must be included
      expect(res.combinedFormatted).toContain('src/types.ts');

      // Manifest (package.json) must be included
      expect(res.combinedFormatted).toContain('package.json');
    });
  });

  describe('Mid-Session Catch-Up Engine', () => {
    it('handles cold-start and backfills NOTES.md with session context', () => {
      const catchUp = synchronizeCatchUpContext(tmpRepo, {
        sessionContext: [
          'Chose SQLite over PostgreSQL for local simplicity',
          'Decided to use JWT tokens with 15min expiry',
        ],
        toolName: 'agent-overwatch_plan_check',
      });

      expect(catchUp.isColdStart).toBe(true);
      expect(catchUp.catchUpSummary).toContain('Cold-Start Session');
      expect(catchUp.catchUpSummary).toContain('Chose SQLite over PostgreSQL');

      const notes = readRepoNotes(tmpRepo);
      expect(notes).toContain('Prior Context: Chose SQLite over PostgreSQL');
      expect(notes).toContain('Prior Context: Decided to use JWT tokens');

      const state = loadRepoState(tmpRepo);
      expect(state).not.toBeNull();
      expect(state?.lastSeenCommit).toBe(catchUp.headCommit);
      expect(state?.lastToolCalled).toBe('agent-overwatch_plan_check');
    });

    it('captures unmonitored commit deltas on subsequent session invocations', () => {
      // 1. First session
      synchronizeCatchUpContext(tmpRepo, {
        sessionContext: ['Initial prompt context'],
        toolName: 'agent-overwatch_plan_check',
      });

      // 2. Simulate 2 commits done without Overwatch
      fs.writeFileSync(path.join(tmpRepo, 'src', 'calc.ts'), 'export const add = (a: number, b: number) => a + b;\n');
      execFileSync('git', ['add', '.'], { cwd: tmpRepo });
      execFileSync('git', ['commit', '-m', 'Unmonitored commit 1: add calc.ts'], { cwd: tmpRepo });

      fs.appendFileSync(path.join(tmpRepo, 'src', 'calc.ts'), 'export const sub = (a: number, b: number) => a - b;\n');
      execFileSync('git', ['add', '.'], { cwd: tmpRepo });
      execFileSync('git', ['commit', '-m', 'Unmonitored commit 2: add sub'], { cwd: tmpRepo });

      // 3. User invokes Overwatch again on Prompt #6
      const secondCatchUp = synchronizeCatchUpContext(tmpRepo, {
        sessionContext: ['User requested calculator enhancements'],
        toolName: 'agent-overwatch_checkpoint',
      });

      expect(secondCatchUp.isColdStart).toBe(false);
      expect(secondCatchUp.catchUpSummary).toContain('[Delta Catch-Up]');
      expect(secondCatchUp.catchUpSummary).toContain('Unmonitored commit 2: add sub');
      expect(secondCatchUp.catchUpSummary).toContain('User requested calculator enhancements');

      const notes = readRepoNotes(tmpRepo);
      expect(notes).toContain('Unmonitored Git Commits Delta');
      expect(notes).toContain('User requested calculator enhancements');
    });
  });
});
