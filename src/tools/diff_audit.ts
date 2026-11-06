import fs from 'node:fs';
import path from 'node:path';
import { OverwatchDiffAuditInput } from '../types.js';
import {
  getGitDiff,
  captureBaselineSnapshot,
  getChangedAndUntrackedFiles,
  BaselineSnapshot,
} from '../context/git.js';
import { gatherDeepRepoContext } from '../context/files.js';
import { readRepoNotes } from '../context/notes.js';
import { DEFAULT_MAX_FILE_BYTES, LOG_PREFIX } from '../constants.js';

export interface DiffAuditResult {
  mode: 'snapshot' | 'audit';
  baseline?: BaselineSnapshot;
  scopedFiles?: string[];
  diff: string;
  untrackedFileContents: Record<string, string>;
  activeNotes: string;
  isClean: boolean;
}

export async function executeDiffAudit(
  input: OverwatchDiffAuditInput
): Promise<{ result: DiffAuditResult; markdown: string }> {
  const repoPath = input.repo_path || process.cwd();

  // Mode 1: Snapshot baseline before subagent delegation
  if (input.mode === 'snapshot') {
    const baseline = captureBaselineSnapshot(repoPath);
    const md = `### 📸 Overwatch Pre-Delegation Baseline Captured

- **Base Commit:** \`${baseline.headCommit || '(no commits yet)'}\`
- **Pre-Existing Dirty/Untracked Files:** ${baseline.dirtyFiles.length > 0 ? baseline.dirtyFiles.map((f) => `\`${f}\``).join(', ') : '*(clean working tree)*'}
- **Timestamp:** \`${baseline.timestamp}\`

> **Senior Architect Instruction:** Pass \`base_commit: "${baseline.headCommit || ''}"\` and instruct the subagent to report its touched files and micro-commit.
`;

    return {
      result: {
        mode: 'snapshot',
        baseline,
        diff: '',
        untrackedFileContents: {},
        activeNotes: readRepoNotes(repoPath),
        isClean: baseline.dirtyFiles.length === 0,
      },
      markdown: md,
    };
  }

  // Mode 2: Audit scoped changes after subagent completion
  const files = input.files && input.files.length > 0 ? input.files : undefined;

  const { diff } = getGitDiff(repoPath, {
    baseRef: input.base_commit,
    targetRef: input.target_commit,
    files,
  });

  const untrackedFileContents: Record<string, string> = {};

  if (files && files.length > 0) {
    // If files are explicitly provided (from subagent manifest), read contents for new or modified files
    for (const file of files) {
      const fullPath = path.isAbsolute(file) ? file : path.join(repoPath, file);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // Include full content if file is new or diff doesn't fully represent it
          if (!diff.includes(`b/${file}`) || content.length < DEFAULT_MAX_FILE_BYTES) {
            untrackedFileContents[file] =
              content.length > DEFAULT_MAX_FILE_BYTES
                ? content.slice(0, DEFAULT_MAX_FILE_BYTES) + '\n\n[... File truncated at cap ...]'
                : content;
          }
        }
      } catch (err) {
        console.warn(`${LOG_PREFIX} Could not read file ${file}:`, err);
      }
    }
  } else {
    // If no explicit files were provided, scan git status
    const { untracked } = getChangedAndUntrackedFiles(repoPath, input.base_commit);
    for (const file of untracked.slice(0, 10)) {
      const fullPath = path.join(repoPath, file);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          untrackedFileContents[file] =
            content.length > DEFAULT_MAX_FILE_BYTES
              ? content.slice(0, DEFAULT_MAX_FILE_BYTES) + '\n\n[... File truncated at cap ...]'
              : content;
        }
      } catch {}
    }
  }

  const notes = readRepoNotes(repoPath);

  let md = `### 🔍 Scoped Diff Audit Context\n\n`;

  if (input.base_commit || input.target_commit) {
    md += `- **Comparison Range:** \`${input.base_commit || 'HEAD'}..${input.target_commit || 'working-tree'}\`\n`;
  }
  if (files && files.length > 0) {
    md += `- **Scoped Files (Zero Dirty Bleed):** ${files.map((f) => `\`${f}\``).join(', ')}\n`;
  }

  if (diff.trim()) {
    md += `\n#### Unified Git Diff:\n\`\`\`diff\n${diff.trim()}\n\`\`\`\n`;
  } else {
    md += `\n*No git diff hunks detected across scoped files.*\n`;
  }

  if (Object.keys(untrackedFileContents).length > 0) {
    md += `\n#### Newly Created / Full File Contents:\n`;
    for (const [file, content] of Object.entries(untrackedFileContents)) {
      md += `\n**File: \`${file}\`**\n\`\`\`\n${content.trim()}\n\`\`\`\n`;
    }
  }

  if (notes.trim()) {
    md += `\n#### Active Project Constraints (.agent-overwatch/NOTES.md):\n${notes.trim()}\n`;
  }

  return {
    result: {
      mode: 'audit',
      scopedFiles: files,
      diff,
      untrackedFileContents,
      activeNotes: notes,
      isClean: !diff.trim() && Object.keys(untrackedFileContents).length === 0,
    },
    markdown: md,
  };
}
