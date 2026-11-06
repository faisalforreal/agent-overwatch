import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MAX_FILE_BYTES, LOG_PREFIX } from '../constants.js';
import { redactSecrets, isSensitiveFilename } from './redactor.js';

export interface FileContextItem {
  relativePath: string;
  content: string;
  sizeBytes: number;
  truncated: boolean;
  reason?: 'explicit' | 'untracked' | 'modified' | 'import_dependency' | 'manifest' | 'detected';
}

export interface DeepContextOptions {
  explicitFiles?: string[];
  modifiedFiles?: string[];
  untrackedFiles?: string[];
  textContext?: string;
  fastMode?: boolean;
  totalMaxBytes?: number;
}

export interface DeepContextResult {
  files: FileContextItem[];
  combinedFormatted: string;
  totalBytes: number;
}

/**
 * Returns true if child is equal to or located strictly inside parent directory.
 * Prevents sibling-directory prefix escapes (e.g. /repo-secrets vs /repo).
 */
export function isSubpath(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function isPathSafe(repoPath: string, targetPath: string): boolean {
  try {
    const absRepo = path.resolve(repoPath);
    const absTarget = path.resolve(absRepo, targetPath);

    // Verify target is strictly within repo directory
    if (!isSubpath(absRepo, absTarget)) {
      return false;
    }

    // Resolve real symlinks if target exists
    if (fs.existsSync(absTarget)) {
      const realTarget = fs.realpathSync(absTarget);
      const realRepo = fs.realpathSync(absRepo);
      if (!isSubpath(realRepo, realTarget)) {
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
  maxBytes = DEFAULT_MAX_FILE_BYTES,
  reason?: FileContextItem['reason']
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
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absPath);
    } catch {
      return null;
    }
    if (!stat.isFile()) {
      return null;
    }

    let raw = fs.readFileSync(absPath, 'utf-8');
    let truncated = false;

    if (stat.size > maxBytes) {
      truncated = true;
      raw =
        raw.slice(0, maxBytes) +
        `\n\n[... Truncated at ${Math.round(maxBytes / 1024)} KB cap ...]`;
    }

    const normalizedRel = path.relative(repoPath, absPath).replace(/\\/g, '/');

    return {
      relativePath: normalizedRel,
      content: redactSecrets(raw),
      sizeBytes: stat.size,
      truncated,
      reason,
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to read ${relativePath}:`, err);
    return null;
  }
}

/**
 * Extracts 1-hop relative local imports (e.g. ./types.js, ../utils) and resolves them to existing files on disk.
 * Supports TypeScript ESM .js -> .ts mapping, extensions (.ts, .tsx, .js, .jsx, .json), and index files.
 */
export function extractLocalImports(
  repoPath: string,
  sourceFileRelPath: string,
  content: string
): string[] {
  const importsFound = new Set<string>();
  const absSource = path.resolve(repoPath, sourceFileRelPath);
  const sourceDir = path.dirname(absSource);

  // Match: import ... from './...' or export ... from './...' or require('./...') or import('./...')
  const esmRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"](\.[^'"]+)['"]/g;
  const cjsRegex = /(?:require|import)\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

  const matches: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = esmRegex.exec(content)) !== null) {
    matches.push(m[1]);
  }
  while ((m = cjsRegex.exec(content)) !== null) {
    matches.push(m[1]);
  }

  for (const rawImport of matches) {
    // Resolve candidates
    const baseTarget = path.resolve(sourceDir, rawImport);
    const candidateExtensions = [
      '',
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.json',
      '/index.ts',
      '/index.tsx',
      '/index.js',
    ];

    // In ESM TypeScript projects, imports end in '.js' but point to '.ts' files on disk
    const pathsToTest: string[] = [];
    if (rawImport.endsWith('.js')) {
      pathsToTest.push(baseTarget.replace(/\.js$/, '.ts'));
      pathsToTest.push(baseTarget.replace(/\.js$/, '.tsx'));
      pathsToTest.push(baseTarget);
    } else {
      for (const ext of candidateExtensions) {
        pathsToTest.push(baseTarget + ext);
      }
    }

    for (const testPath of pathsToTest) {
      if (fs.existsSync(testPath) && isPathSafe(repoPath, testPath)) {
        try {
          if (fs.statSync(testPath).isFile()) {
            const rel = path.relative(repoPath, testPath).replace(/\\/g, '/');
            if (rel !== sourceFileRelPath && !isSensitiveFilename(rel)) {
              importsFound.add(rel);
              break;
            }
          }
        } catch {}
      }
    }
  }

  return Array.from(importsFound);
}

/**
 * Heuristically detects existing files in repository referenced in prompt, user_goal, or proposed plan.
 */
export function detectRelevantExistingFiles(
  repoPath: string,
  textContext?: string,
  maxFiles = 5
): string[] {
  if (!textContext || !textContext.trim()) return [];

  const matched = new Set<string>();
  // Match file-like tokens: e.g. path/to/file.ext or simple file.ext
  const filePattern = /[a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+/g;
  const tokens = textContext.match(filePattern) || [];

  for (const token of tokens) {
    if (matched.size >= maxFiles) break;
    const cleanToken = token.trim().replace(/^['"`<([{\\]+|['"`>\])}\\,.]+$/g, '');
    if (!cleanToken || cleanToken.length < 3 || isSensitiveFilename(cleanToken)) continue;

    // Check direct relative path
    const directAbs = path.resolve(repoPath, cleanToken);
    if (fs.existsSync(directAbs) && isPathSafe(repoPath, cleanToken)) {
      try {
        if (fs.statSync(directAbs).isFile()) {
          matched.add(path.relative(repoPath, directAbs).replace(/\\/g, '/'));
          continue;
        }
      } catch {}
    }

    // Check src/ prefix if not specified
    const inSrc = path.resolve(repoPath, 'src', cleanToken);
    if (fs.existsSync(inSrc) && isPathSafe(repoPath, path.join('src', cleanToken))) {
      try {
        if (fs.statSync(inSrc).isFile()) {
          matched.add(path.relative(repoPath, inSrc).replace(/\\/g, '/'));
        }
      } catch {}
    }
  }

  return Array.from(matched);
}

/**
 * Comprehensive Deep Repository Context Gathering Engine.
 *
 * Prioritizes:
 * 1. Explicitly requested relevant_files & prompt-detected existing files (even if completely unedited)
 * 2. Brand-new untracked files (?? in git status) that git diff misses
 * 3. Full surrounding content of modified files
 * 4. 1-hop local imports (types, interfaces, helpers) from modified and relevant files
 * 5. Project manifests (package.json, tsconfig.json, pyproject.toml, etc.)
 */
export function gatherDeepRepoContext(
  repoPath: string,
  options: DeepContextOptions = {}
): DeepContextResult {
  const totalMaxBytes = options.totalMaxBytes || 250 * 1024;
  const result: FileContextItem[] = [];
  const processedPaths = new Set<string>();
  let currentBytes = 0;

  function tryAddFile(relPath: string, reason: FileContextItem['reason']): boolean {
    const norm = relPath.replace(/\\/g, '/').trim();
    if (!norm || processedPaths.has(norm)) return false;
    if (currentBytes >= totalMaxBytes) return false;

    const item = readFileSafely(repoPath, norm, DEFAULT_MAX_FILE_BYTES, reason);
    if (item && item.content.trim()) {
      processedPaths.add(norm);
      result.push(item);
      currentBytes += item.sizeBytes;
      return true;
    }
    return false;
  }

  // Priority 1: Explicit relevant_files + prompt-detected existing relevant files
  const explicit = options.explicitFiles || [];
  for (const f of explicit) {
    tryAddFile(f, 'explicit');
  }

  const detected = detectRelevantExistingFiles(repoPath, options.textContext);
  for (const f of detected) {
    tryAddFile(f, 'detected');
  }

  // If in fastMode, stop after explicit/detected files to maintain low latency
  if (options.fastMode) {
    return formatDeepContextResult(result, currentBytes);
  }

  // Priority 2: Newly created untracked files (?? in git status)
  const untracked = options.untrackedFiles || [];
  for (const f of untracked) {
    tryAddFile(f, 'untracked');
  }

  // Priority 3: Full contents of modified files
  const modified = options.modifiedFiles || [];
  for (const f of modified) {
    tryAddFile(f, 'modified');
  }

  // Priority 4: 1-hop local dependencies and types imported by gathered files
  const initialFiles = [...result];
  for (const fileItem of initialFiles) {
    if (currentBytes >= totalMaxBytes) break;
    const imports = extractLocalImports(repoPath, fileItem.relativePath, fileItem.content);
    for (const imp of imports) {
      if (currentBytes >= totalMaxBytes) break;
      tryAddFile(imp, 'import_dependency');
    }
  }

  // Priority 5: Project manifests
  const manifestCandidates = [
    'package.json',
    'tsconfig.json',
    'Cargo.toml',
    'pyproject.toml',
    'go.mod',
  ];
  for (const manifest of manifestCandidates) {
    if (currentBytes >= totalMaxBytes) break;
    tryAddFile(manifest, 'manifest');
  }

  return formatDeepContextResult(result, currentBytes);
}

function formatDeepContextResult(files: FileContextItem[], totalBytes: number): DeepContextResult {
  let combined = '';
  for (const f of files) {
    const reasonLabel = f.reason ? ` [reason: ${f.reason}]` : '';
    const truncLabel = f.truncated ? ' (truncated)' : ' (full)';
    combined += `--- File: ${f.relativePath}${reasonLabel}${truncLabel} ---\n`;
    combined += `${f.content}\n\n`;
  }

  return {
    files,
    combinedFormatted: combined.trim(),
    totalBytes,
  };
}

/**
 * Legacy wrapper maintaining backwards compatibility with tests and callers
 */
export function gatherRelevantFiles(
  repoPath: string,
  candidatePaths: string[] = [],
  totalMaxBytes = 250 * 1024
): { files: FileContextItem[]; combinedFormatted: string } {
  const res = gatherDeepRepoContext(repoPath, {
    explicitFiles: candidatePaths,
    totalMaxBytes,
  });
  return {
    files: res.files,
    combinedFormatted: res.combinedFormatted,
  };
}
