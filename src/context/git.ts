import { execFileSync } from 'node:child_process';
import { DEFAULT_MAX_DIFF_BYTES } from '../constants.js';
import { redactSecrets } from './redactor.js';

export interface GitContextResult {
  gitStatus?: string;
  gitDiff?: string;
  isGitRepo: boolean;
  truncated: boolean;
  repoTree?: string;
  untrackedFiles?: string[];
  modifiedFiles?: string[];
  recentCommits?: string;
  headCommit?: string;
}

/**
 * Validates a git reference string to prevent command/flag injection.
 * Disallows leading dashes, spaces, semicolons, shell metacharacters.
 */
export function isValidGitRef(ref: string): boolean {
  if (!ref || typeof ref !== 'string') return false;
  const trimmed = ref.trim();
  if (trimmed.startsWith('-')) return false; // Prevent flag injection (e.g. --output=...)
  // Safe git ref characters: alphanumeric, dots, slashes, underscores, tilde, caret, at, colon
  return /^[a-zA-Z0-9._\-/~^:@{}]+$/.test(trimmed);
}

export function getGitStatus(repoPath: string): string {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], {
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

/**
 * Scans porcelain status and diff name-only to categorize files into modified vs newly created untracked files
 */
export function getChangedAndUntrackedFiles(
  repoPath: string,
  baseRef?: string
): { modified: string[]; untracked: string[] } {
  const modifiedSet = new Set<string>();
  const untrackedSet = new Set<string>();

  try {
    const statusOutput = execFileSync('git', ['status', '--porcelain'], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const lines = statusOutput.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line) continue;
      const statusPrefix = line.substring(0, 2);
      const filePath = line.substring(3).trim();
      if (!filePath) continue;

      if (statusPrefix === '??') {
        untrackedSet.add(filePath);
      } else {
        // e.g. ' M', 'M ', 'A ', 'AM', 'D '
        // If it's a rename 'R  orig -> new', take destination
        if (filePath.includes(' -> ')) {
          const parts = filePath.split(' -> ');
          modifiedSet.add(parts[1].trim());
        } else {
          modifiedSet.add(filePath);
        }
      }
    }

    // Also collect files modified relative to baseRef if supplied
    if (baseRef && isValidGitRef(baseRef)) {
      const diffNameOutput = execFileSync('git', ['diff', '--name-only', baseRef.trim(), '--'], {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const name of diffNameOutput.split('\n')) {
        const trimmed = name.trim();
        if (trimmed && !untrackedSet.has(trimmed)) {
          modifiedSet.add(trimmed);
        }
      }
    }
  } catch {
    // Return whatever was collected
  }

  return {
    modified: Array.from(modifiedSet),
    untracked: Array.from(untrackedSet),
  };
}

/**
 * Produces a compact, structured representation of the repository file tree
 */
export function getRepoFileTree(repoPath: string, maxFiles = 200): string {
  try {
    const output = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );

    const allFiles = output
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    if (allFiles.length === 0) return '';

    const displayedFiles = allFiles.slice(0, maxFiles);
    let treeStr = displayedFiles.join('\n');
    if (allFiles.length > maxFiles) {
      treeStr += `\n[... and ${allFiles.length - maxFiles} more files in repository ...]`;
    }
    return treeStr;
  } catch {
    return '';
  }
}

/**
 * Retrieves the recent git commit history and current HEAD commit
 */
export function getRecentGitLog(
  repoPath: string,
  sinceCommit?: string,
  maxCommits = 10
): { log: string; headCommit?: string } {
  try {
    let headCommit: string | undefined;
    try {
      headCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      // Empty or newly initialized repo without HEAD yet
    }

    let gitArgs: string[];
    if (sinceCommit && isValidGitRef(sinceCommit)) {
      gitArgs = ['log', `${sinceCommit.trim()}..HEAD`, '--oneline', '--stat', `-n`, String(maxCommits)];
    } else {
      gitArgs = ['log', `-n`, String(maxCommits), '--oneline', '--stat'];
    }

    let log = '';
    try {
      log = execFileSync('git', gitArgs, {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      // Fallback to simple oneline log if range failed
      try {
        log = execFileSync('git', ['log', `-n`, String(maxCommits), '--oneline'], {
          cwd: repoPath,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
      } catch {
        log = '';
      }
    }

    return { log, headCommit };
  } catch {
    return { log: '', headCommit: undefined };
  }
}

export interface GetGitDiffOptions {
  baseRef?: string;
  targetRef?: string;
  files?: string[];
  maxBytes?: number;
}

export interface BaselineSnapshot {
  headCommit?: string;
  dirtyFiles: string[];
  timestamp: string;
}

/**
 * Captures the repository state before delegation to establish a clean comparison baseline.
 */
export function captureBaselineSnapshot(repoPath: string): BaselineSnapshot {
  let headCommit: string | undefined;
  try {
    headCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {}

  const { modified, untracked } = getChangedAndUntrackedFiles(repoPath);
  return {
    headCommit,
    dirtyFiles: [...modified, ...untracked],
    timestamp: new Date().toISOString(),
  };
}

export function getGitDiff(
  repoPath: string,
  baseRefOrOptions?: string | GetGitDiffOptions,
  maxBytesParam = DEFAULT_MAX_DIFF_BYTES
): { diff: string; truncated: boolean } {
  const opts: GetGitDiffOptions =
    typeof baseRefOrOptions === 'object' && baseRefOrOptions !== null
      ? baseRefOrOptions
      : { baseRef: baseRefOrOptions, maxBytes: maxBytesParam };

  const maxBytes = opts.maxBytes || DEFAULT_MAX_DIFF_BYTES;

  try {
    let diffArgs: string[] = ['diff'];

    if (opts.baseRef && opts.targetRef) {
      const cleanBase = opts.baseRef.trim();
      const cleanTarget = opts.targetRef.trim();
      if (!isValidGitRef(cleanBase) || !isValidGitRef(cleanTarget)) {
        throw new Error(`Invalid git reference: ${cleanBase}..${cleanTarget}`);
      }
      diffArgs.push(`${cleanBase}..${cleanTarget}`);
    } else if (opts.baseRef && opts.baseRef.trim()) {
      const cleanRef = opts.baseRef.trim();
      if (!isValidGitRef(cleanRef)) {
        throw new Error(`Invalid git reference: ${cleanRef}`);
      }
      diffArgs.push(cleanRef);
    } else {
      diffArgs.push('HEAD');
    }

    diffArgs.push('--');

    if (opts.files && opts.files.length > 0) {
      for (const f of opts.files) {
        const trimmed = f.trim();
        // Prevent flag injection in file paths
        if (trimmed && !trimmed.startsWith('-')) {
          diffArgs.push(trimmed);
        }
      }
    }

    let output = execFileSync('git', diffArgs, {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    if (!output.trim() && !opts.baseRef && !opts.targetRef) {
      // If HEAD diff is empty, also try unstaged diff
      const unstagedArgs = ['diff', '--'];
      if (opts.files && opts.files.length > 0) {
        for (const f of opts.files) {
          const trimmed = f.trim();
          if (trimmed && !trimmed.startsWith('-')) {
            unstagedArgs.push(trimmed);
          }
        }
      }
      output = execFileSync('git', unstagedArgs, {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    }

    let truncated = false;
    const outputBytes = Buffer.byteLength(output, 'utf-8');
    if (outputBytes > maxBytes) {
      truncated = true;
      // Slice by bytes, not char index, to honour the cap precisely with multibyte content
      const buf = Buffer.from(output, 'utf-8').subarray(0, maxBytes);
      // Trim any incomplete multibyte sequence at the cut point
      output =
        buf.toString('utf-8').replace(/\uFFFD+$/, '') +
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
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const status = getGitStatus(repoPath);
    const { diff, truncated } = getGitDiff(repoPath, baseRef, maxBytes);
    const { modified, untracked } = getChangedAndUntrackedFiles(repoPath, baseRef);
    const repoTree = getRepoFileTree(repoPath);
    const { log: recentCommits, headCommit } = getRecentGitLog(repoPath);

    return {
      isGitRepo: true,
      gitStatus: status,
      gitDiff: diff,
      truncated,
      repoTree,
      untrackedFiles: untracked,
      modifiedFiles: modified,
      recentCommits,
      headCommit,
    };
  } catch {
    return {
      isGitRepo: false,
      truncated: false,
    };
  }
}
