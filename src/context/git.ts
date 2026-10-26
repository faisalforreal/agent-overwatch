import { execSync } from 'node:child_process';
import { DEFAULT_MAX_DIFF_BYTES } from '../constants.js';
import { redactSecrets } from './redactor.js';

export interface GitContextResult {
  gitStatus?: string;
  gitDiff?: string;
  isGitRepo: boolean;
  truncated: boolean;
}

export function getGitStatus(repoPath: string): string {
  try {
    const output = execSync('git status --porcelain', {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.trim();
  } catch {
    return '';
  }
}

export function getGitDiff(
  repoPath: string,
  baseRef?: string,
  maxBytes = DEFAULT_MAX_DIFF_BYTES
): { diff: string; truncated: boolean } {
  try {
    // If baseRef is given, diff against it; otherwise diff HEAD (covers both staged and unstaged)
    const cmd = baseRef ? `git diff ${baseRef}` : 'git diff HEAD';
    let output = execSync(cmd, {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    if (!output.trim()) {
      // If HEAD diff is empty, also try unstaged diff
      output = execSync('git diff', {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    }

    let truncated = false;
    if (Buffer.byteLength(output, 'utf-8') > maxBytes) {
      truncated = true;
      output =
        output.slice(0, maxBytes) +
        `\n\n[... Git diff truncated at ${Math.round(maxBytes / 1024)} KB cap for model context ...]`;
    }

    return {
      diff: redactSecrets(output.trim()),
      truncated,
    };
  } catch {
    return { diff: '', truncated: false };
  }
}

export function gatherGitContext(
  repoPath: string,
  baseRef?: string,
  maxBytes = DEFAULT_MAX_DIFF_BYTES
): GitContextResult {
  try {
    // Check if repoPath is in a git repo
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const status = getGitStatus(repoPath);
    const { diff, truncated } = getGitDiff(repoPath, baseRef, maxBytes);

    return {
      isGitRepo: true,
      gitStatus: status,
      gitDiff: diff,
      truncated,
    };
  } catch {
    return {
      isGitRepo: false,
      truncated: false,
    };
  }
}
