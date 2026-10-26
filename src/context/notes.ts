import fs from 'node:fs';
import path from 'node:path';
import { TARGET_NOTES_DIR, NOTES_FILE, DEFAULT_MAX_NOTES_BYTES } from '../constants.js';

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
    console.error(`[overwatch] Failed to read notes at ${notesPath}:`, err);
  }
  return '';
}

/**
 * Summarizes older entries into a categorized, high-density synthesis
 * instead of naive line truncation.
 */
export function summarizeOldNotes(rawContent: string): string {
  const lines = rawContent.split('\n');
  const decisions = new Set<string>();
  const constraints = new Set<string>();
  const rejected = new Set<string>();
  const generalNotes = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
      continue;
    }
    const text = trimmed.replace(/^[-*]\s+/, '');
    const lower = text.toLowerCase();

    if (lower.startsWith('decision:') || lower.includes('decided to') || lower.includes('architectural:')) {
      decisions.add(text.replace(/^decision:\s*/i, ''));
    } else if (lower.startsWith('constraint:') || lower.includes('must ') || lower.includes('required:')) {
      constraints.add(text.replace(/^constraint:\s*/i, ''));
    } else if (lower.startsWith('rejected:') || lower.includes('rejected') || lower.includes('do not use')) {
      rejected.add(text.replace(/^rejected:\s*/i, ''));
    } else if (text.length > 5) {
      generalNotes.add(text);
    }
  }

  let summary = `# Overwatch Architectural Memory (NOTES.md)\n\n`;
  summary += `> *[Automated Synthesis: Prior decisions compacted to stay within token budget while preserving critical architectural constraints.]*\n\n`;

  if (decisions.size > 0) {
    summary += `### 🏛️ Core Architectural Decisions\n`;
    let count = 0;
    for (const d of decisions) {
      if (count++ >= 15) break;
      summary += `- ${d}\n`;
    }
    summary += `\n`;
  }

  if (constraints.size > 0) {
    summary += `### 🔒 Active Constraints & Requirements\n`;
    let count = 0;
    for (const c of constraints) {
      if (count++ >= 15) break;
      summary += `- ${c}\n`;
    }
    summary += `\n`;
  }

  if (rejected.size > 0) {
    summary += `### ❌ Explicitly Rejected Approaches\n`;
    let count = 0;
    for (const r of rejected) {
      if (count++ >= 15) break;
      summary += `- ${r}\n`;
    }
    summary += `\n`;
  }

  if (generalNotes.size > 0 && summary.length < DEFAULT_MAX_NOTES_BYTES / 2) {
    summary += `### 📌 Established Guidelines\n`;
    let count = 0;
    for (const g of generalNotes) {
      if (count++ >= 15) break; // Keep most relevant
      summary += `- ${g}\n`;
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

  // 1. First run the semantic summarizer across content
  const summarized = summarizeOldNotes(content);
  if (Buffer.byteLength(summarized, 'utf-8') <= maxBytes) {
    return summarized;
  }

  // 2. If still exceeding, extract latest 50 lines and append to condensed summary
  const lines = summarized.split('\n');
  const cappedLines = lines.slice(0, 100);
  return cappedLines.join('\n');
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
      existing = `# Overwatch Architectural Memory (NOTES.md)\n\nThis file preserves core senior architectural decisions, rejected approaches, and constraints.\nThe junior agent must inspect this file at the start of every iteration.\n\n`;
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
    console.error(`[overwatch] Failed to write notes to ${notesPath}:`, err);
  }
}
