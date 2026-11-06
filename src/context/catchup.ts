import fs from 'node:fs';
import path from 'node:path';
import { TARGET_NOTES_DIR, APP_NAME, LOG_PREFIX } from '../constants.js';
import { appendRepoNotes } from './notes.js';
import { getRecentGitLog } from './git.js';

export const STATE_FILE = 'state.json';

export interface OverwatchRepoState {
  lastSeenCommit?: string;
  lastSeenTimestamp: string;
  lastToolCalled: string;
  totalSessions: number;
  initialCatchUpDone: boolean;
}

export function getStateFilePath(repoPath: string): string {
  return path.join(repoPath, TARGET_NOTES_DIR, STATE_FILE);
}

export function loadRepoState(repoPath: string): OverwatchRepoState | null {
  const filePath = getStateFilePath(repoPath);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to load state at ${filePath}:`, err);
  }
  return null;
}

export function saveRepoState(repoPath: string, state: OverwatchRepoState): void {
  const dirPath = path.join(repoPath, TARGET_NOTES_DIR);
  const filePath = getStateFilePath(repoPath);
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempFile, filePath);
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to save state to ${filePath}:`, err);
  }
}

export interface CatchUpSyncResult {
  catchUpSummary: string;
  isColdStart: boolean;
  commitsSinceLastSession: string;
  headCommit?: string;
}

/**
 * Synchronizes mid-session deltas when Overwatch is invoked after unmonitored prompts.
 *
 * 1. Persists prior conversational decisions (passed via session_context) directly into NOTES.md
 * 2. Compares git log against last-seen commit to surface code written during unmonitored prompts
 * 3. Updates state.json with current HEAD and timestamp
 */
export function synchronizeCatchUpContext(
  repoPath: string,
  options: {
    sessionContext?: string[];
    toolName: string;
  }
): CatchUpSyncResult {
  const existingState = loadRepoState(repoPath);
  const isColdStart = !existingState;

  const { log: gitLogSince, headCommit } = getRecentGitLog(
    repoPath,
    existingState?.lastSeenCommit,
    10
  );

  const notesToAdd: string[] = [];

  // 1. Ingest conversational context from unmonitored prompts
  if (options.sessionContext && options.sessionContext.length > 0) {
    for (const item of options.sessionContext) {
      const trimmed = item.trim();
      if (trimmed) {
        notesToAdd.push(`Prior Context: ${trimmed}`);
      }
    }
  }

  // 2. If there are intermediate commits made without Overwatch, record them in notes
  if (gitLogSince && !isColdStart) {
    notesToAdd.push(`Unmonitored Git Commits Delta: ${gitLogSince.split('\n')[0]}`);
  }

  if (notesToAdd.length > 0) {
    appendRepoNotes(repoPath, notesToAdd);
  }

  // 3. Update state.json
  const newState: OverwatchRepoState = {
    lastSeenCommit: headCommit,
    lastSeenTimestamp: new Date().toISOString(),
    lastToolCalled: options.toolName,
    totalSessions: (existingState?.totalSessions || 0) + 1,
    initialCatchUpDone: true,
  };
  saveRepoState(repoPath, newState);

  // 4. Assemble human & LLM-readable catch-up summary
  let catchUpSummary = '';
  if (isColdStart) {
    catchUpSummary += `[Cold-Start Session]: Overwatch was activated on an existing codebase.\n`;
    if (gitLogSince) {
      catchUpSummary += `Recent Commits Prior to Overwatch:\n${gitLogSince}\n`;
    }
  } else if (gitLogSince) {
    catchUpSummary += `[Delta Catch-Up]: Commits executed since last monitored session:\n${gitLogSince}\n`;
  }

  if (options.sessionContext && options.sessionContext.length > 0) {
    catchUpSummary += `\nPrior Conversation Decisions (Prompts without Overwatch):\n`;
    for (const sc of options.sessionContext) {
      catchUpSummary += `- ${sc}\n`;
    }
  }

  return {
    catchUpSummary: catchUpSummary.trim(),
    isColdStart,
    commitsSinceLastSession: gitLogSince,
    headCommit,
  };
}
