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

export function compactNotesContent(content: string, maxBytes = DEFAULT_MAX_NOTES_BYTES): string {
  const currentBytes = Buffer.byteLength(content, 'utf-8');
  if (currentBytes <= maxBytes) {
    return content;
  }

  const lines = content.split('\n');
  const headerLines = lines.slice(0, 10); // Keep initial introduction
  const recentLines = lines.slice(-200); // Keep last 200 lines of latest decisions

  const compacted = [
    ...headerLines,
    '\n> *[... Earlier decisions compacted to stay within size cap ...]*\n',
    ...recentLines,
  ].join('\n');

  return compacted;
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
