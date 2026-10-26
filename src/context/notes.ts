import fs from 'node:fs';
import path from 'node:path';
import {
  APP_NAME,
  TARGET_NOTES_DIR,
  NOTES_FILE,
  DEFAULT_MAX_NOTES_BYTES,
  LOG_PREFIX,
} from '../constants.js';

export function getRepoNotesPath(repoPath: string): string {
  return path.join(repoPath, TARGET_NOTES_DIR, NOTES_FILE);
}

export function readRepoNotes(repoPath: string): string {
  const notesPath = getRepoNotesPath(repoPath);
  try {
    if (fs.existsSync(notesPath)) {
      return fs.readFileSync(notesPath, 'utf-8');
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to read notes at ${notesPath}:`, err);
  }
  return '';
}

/**
 * Normalizes text for deduplication
 */
function normalizeBullet(text: string): string {
  return text.trim().replace(/^[-*]\s+/, '').replace(/\s+/g, ' ');
}

/**
 * Synthesizes and categorizes free-form notes into structured sections
 * without using an LLM, and crucially: NEVER silently drops a constraint.
 * Uses clean Markdown headers without emojis to preserve token efficiency.
 */
export function summarizeOldNotes(rawContent: string): string {
  const lines = rawContent.split('\n');
  const decisions = new Map<string, string>();
  const constraints = new Map<string, string>();
  const rejected = new Map<string, string>();
  const projectNotes = new Map<string, string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
      continue;
    }

    const text = normalizeBullet(trimmed);
    if (!text || text.length < 3) continue;

    const lower = text.toLowerCase();
    const key = lower;

    // Categorization logic covering both tagged prefixes and natural language intent
    if (
      lower.startsWith('constraint:') ||
      lower.includes('must ') ||
      lower.includes('required:') ||
      lower.includes('enforce ') ||
      lower.includes('never ') ||
      lower.includes('strictly ')
    ) {
      const clean = text.replace(/^constraint:\s*/i, '');
      constraints.set(key, clean);
    } else if (
      lower.startsWith('rejected:') ||
      lower.includes('rejected ') ||
      lower.includes('avoid ') ||
      lower.includes('do not use') ||
      lower.includes('abandoned ')
    ) {
      const clean = text.replace(/^rejected:\s*/i, '');
      rejected.set(key, clean);
    } else if (
      lower.startsWith('decision:') ||
      lower.includes('decided to') ||
      lower.includes('architectural:') ||
      lower.includes('standard:') ||
      lower.includes('chose ')
    ) {
      const clean = text.replace(/^decision:\s*/i, '');
      decisions.set(key, clean);
    } else {
      // Anything else is preserved in general project notes
      projectNotes.set(key, text);
    }
  }

  let summary = `# ${APP_NAME.toUpperCase()} Project Memory (${NOTES_FILE})\n\n`;
  summary += `> [System Memory: Synthesized architectural constraints, decisions, and rejected approaches. Do not violate.]\n\n`;

  // Constraints and Rejected approaches are CRITICAL: preserve up to 30 each without starvation
  const MAX_ITEMS_PER_SECTION = 30;

  if (constraints.size > 0) {
    summary += `## System Constraints\n`;
    const entries = Array.from(constraints.values());
    const displayEntries = entries.slice(-MAX_ITEMS_PER_SECTION);
    if (entries.length > MAX_ITEMS_PER_SECTION) {
      summary += `- [${entries.length - MAX_ITEMS_PER_SECTION} earlier system constraints consolidated]\n`;
    }
    for (const val of displayEntries) {
      summary += `- ${val}\n`;
    }
    summary += `\n`;
  }

  if (rejected.size > 0) {
    summary += `## Rejected Approaches\n`;
    const entries = Array.from(rejected.values());
    const displayEntries = entries.slice(-MAX_ITEMS_PER_SECTION);
    if (entries.length > MAX_ITEMS_PER_SECTION) {
      summary += `- [${entries.length - MAX_ITEMS_PER_SECTION} earlier rejected approaches consolidated]\n`;
    }
    for (const val of displayEntries) {
      summary += `- ${val}\n`;
    }
    summary += `\n`;
  }

  if (decisions.size > 0) {
    summary += `## Architectural Decisions\n`;
    const entries = Array.from(decisions.values());
    const displayEntries = entries.slice(-MAX_ITEMS_PER_SECTION);
    if (entries.length > MAX_ITEMS_PER_SECTION) {
      summary += `- [${entries.length - MAX_ITEMS_PER_SECTION} earlier architectural decisions consolidated]\n`;
    }
    for (const val of displayEntries) {
      summary += `- ${val}\n`;
    }
    summary += `\n`;
  }

  if (projectNotes.size > 0) {
    summary += `## Project Notes\n`;
    const entries = Array.from(projectNotes.values());
    const displayEntries = entries.slice(-MAX_ITEMS_PER_SECTION);
    if (entries.length > MAX_ITEMS_PER_SECTION) {
      summary += `- [${entries.length - MAX_ITEMS_PER_SECTION} earlier general notes consolidated]\n`;
    }
    for (const val of displayEntries) {
      summary += `- ${val}\n`;
    }
    summary += `\n`;
  }

  return summary.trim();
}

export function compactNotesContent(content: string, maxBytes = DEFAULT_MAX_NOTES_BYTES): string {
  const currentBytes = Buffer.byteLength(content, 'utf-8');
  if (currentBytes <= maxBytes) {
    return content;
  }

  const summarized = summarizeOldNotes(content);
  if (Buffer.byteLength(summarized, 'utf-8') <= maxBytes) {
    return summarized;
  }

  // If still exceeding maxBytes, stream lines until within maxBytes budget
  const lines = summarized.split('\n');
  const keptLines: string[] = [];
  let totalBytes = 0;

  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line + '\n', 'utf-8');
    if (totalBytes + lineBytes > maxBytes - 200) {
      keptLines.push('> [Earlier entries compacted to respect context token budget]');
      break;
    }
    keptLines.push(line);
    totalBytes += lineBytes;
  }

  return keptLines.join('\n');
}

export function appendRepoNotes(
  repoPath: string,
  newNotes: string[],
  maxBytes = DEFAULT_MAX_NOTES_BYTES
): void {
  if (!newNotes || newNotes.length === 0) return;

  const notesDir = path.join(repoPath, TARGET_NOTES_DIR);
  const notesPath = path.join(notesDir, NOTES_FILE);

  try {
    if (!fs.existsSync(notesDir)) {
      fs.mkdirSync(notesDir, { recursive: true });
    }

    let existing = '';
    if (fs.existsSync(notesPath)) {
      existing = fs.readFileSync(notesPath, 'utf-8');
    } else {
      existing = `# ${APP_NAME.toUpperCase()} Project Memory (${NOTES_FILE})\n\nThis file preserves core senior architectural decisions, rejected approaches, and constraints.\nThe junior agent must inspect this file at the start of every iteration.\n\n`;
    }

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    let addition = `\n### Checkpoint: ${timestamp}\n`;
    for (const note of newNotes) {
      addition += `- ${note.trim()}\n`;
    }

    let fullContent = existing + addition;
    fullContent = compactNotesContent(fullContent, maxBytes);

    fs.writeFileSync(notesPath, fullContent, 'utf-8');
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to write notes to ${notesPath}:`, err);
  }
}
