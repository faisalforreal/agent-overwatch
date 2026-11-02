import { execFileSync } from 'node:child_process';
import { DEFAULT_MAX_DIFF_BYTES } from '../constants.js';
import { redactSecrets } from './redactor.js';

export interface GitContextResult {
  gitStatus?: string;
  gitDiff?: string;
  isGitRepo: boolean;
  truncated: boolean;
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

export function getGitDiff(
  repoPath: string,
  baseRef?: string,
  maxBytes = DEFAULT_MAX_DIFF_BYTES
): { diff: string; truncated: boolean } {
  try {
    let diffArgs: string[];
    if (baseRef && baseRef.trim()) {
      const cleanRef = baseRef.trim();
      if (!isValidGitRef(cleanRef)) {
        throw new Error(`Invalid git reference: ${cleanRef}`);
      }
      diffArgs = ['diff', cleanRef, '--'];
    } else {
      diffArgs = ['diff', 'HEAD', '--'];
    }

    let output = execFileSync('git', diffArgs, {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    if (!output.trim()) {
      // If HEAD diff is empty, also try unstaged diff
      output = execFileSync('git', ['diff', '--'], {
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
