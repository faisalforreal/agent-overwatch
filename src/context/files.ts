import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MAX_FILE_BYTES, LOG_PREFIX } from '../constants.js';
import { redactSecrets, isSensitiveFilename } from './redactor.js';

export interface FileContextItem {
  relativePath: string;
  content: string;
  sizeBytes: number;
  truncated: boolean;
}

export function isPathSafe(repoPath: string, targetPath: string): boolean {
  try {
    const absRepo = path.resolve(repoPath);
    const absTarget = path.resolve(absRepo, targetPath);

    // Basic startsWith check
    if (!absTarget.startsWith(absRepo)) {
      return false;
    }

    // Resolve real symlinks if target exists
    if (fs.existsSync(absTarget)) {
      const realTarget = fs.realpathSync(absTarget);
      const realRepo = fs.realpathSync(absRepo);
      if (!realTarget.startsWith(realRepo)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function readFileSafely(
  repoPath: string,
  relativePath: string,
  maxBytes = DEFAULT_MAX_FILE_BYTES
): FileContextItem | null {
  if (isSensitiveFilename(relativePath)) {
    return null;
  }

  if (!isPathSafe(repoPath, relativePath)) {
    console.error(`${LOG_PREFIX} Blocked potential path traversal: ${relativePath}`);
    return null;
  }

  const absPath = path.resolve(repoPath, relativePath);
  try {
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      return null;
    }

    const stat = fs.statSync(absPath);
    let raw = fs.readFileSync(absPath, 'utf-8');
    let truncated = false;

    if (stat.size > maxBytes) {
      truncated = true;
      raw =
        raw.slice(0, maxBytes) +
        `\n\n[... Truncated at ${Math.round(maxBytes / 1024)} KB cap ...]`;
    }

    return {
      relativePath,
      content: redactSecrets(raw),
      sizeBytes: stat.size,
      truncated,
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to read ${relativePath}:`, err);
    return null;
  }
}

export function gatherRelevantFiles(
  repoPath: string,
  candidatePaths: string[] = [],
  totalMaxBytes = 250 * 1024
): { files: FileContextItem[]; combinedFormatted: string } {
  const result: FileContextItem[] = [];
  let currentBytes = 0;

  // Auto-detect key architecture / manifest files if not provided
  const defaults = [
    'package.json',
    'tsconfig.json',
    'Cargo.toml',
    'pyproject.toml',
    'go.mod',
    'README.md',
  ];
  const allCandidates = Array.from(new Set([...candidatePaths, ...defaults]));

  for (const rel of allCandidates) {
    if (currentBytes >= totalMaxBytes) break;

    const item = readFileSafely(repoPath, rel);
    if (item && item.content.trim()) {
      result.push(item);
      currentBytes += item.sizeBytes;
    }
  }

  // Format into combined string for LLM context
  let combined = '';
  for (const f of result) {
    combined += `--- File: ${f.relativePath} (${f.truncated ? 'truncated' : 'full'}) ---\n`;
    combined += `${f.content}\n\n`;
  }

  return {
    files: result,
    combinedFormatted: combined.trim(),
  };
}
