import { describe, it, expect } from 'vitest';
import { summarizeOldNotes, compactNotesContent } from '../src/context/notes.js';
import { DEFAULT_MAX_NOTES_BYTES } from '../src/constants.js';

describe('Semantic Notes Compaction & 10KB Cap Suite', () => {
  it('enforces DEFAULT_MAX_NOTES_BYTES at 10KB', () => {
    expect(DEFAULT_MAX_NOTES_BYTES).toBe(10 * 1024);
  });

  it('categorizes and deduplicates decisions, constraints, and rejected approaches', () => {
    const raw = `# Raw Notes
- Decision: Use SQLite with WAL mode for local storage
- Decision: Use SQLite with WAL mode for local storage
- Constraint: Never execute commands outside repo directory
- Constraint: All network calls must observe 90s timeout
- Rejected: MongoDB was rejected due to lack of ACID transactions
- Rejected: Unstructured string logging was rejected
- Guideline: Keep component files under 300 lines`;

    const summary = summarizeOldNotes(raw);
    expect(summary).toContain('Core Architectural Decisions');
    expect(summary).toContain('Active Constraints & Requirements');
    expect(summary).toContain('Explicitly Rejected Approaches');
    expect(summary).toContain('SQLite with WAL mode');
    expect(summary).toContain('Never execute commands outside repo directory');
    expect(summary).toContain('MongoDB was rejected');
  });

  it('condenses 40KB of raw checkpoint entries into <10KB structured summary', () => {
    let largeContent = '# Initial Notes\n';
    for (let i = 0; i < 300; i++) {
      largeContent += `### Checkpoint ${i}\n`;
      largeContent += `- Decision: Architectural strategy pattern for provider ${i % 5}\n`;
      largeContent += `- Constraint: Enforce 90000ms timeout on API call ${i}\n`;
      largeContent += `- Rejected: Do not use synchronous child_process.exec in worker ${i}\n`;
      largeContent += `- Iteration step log: finished compiling file number ${i}\n`;
    }

    const rawBytes = Buffer.byteLength(largeContent, 'utf-8');
    expect(rawBytes).toBeGreaterThan(30 * 1024);

    const compacted = compactNotesContent(largeContent, 10 * 1024);
    const compactedBytes = Buffer.byteLength(compacted, 'utf-8');

    expect(compactedBytes).toBeLessThanOrEqual(10 * 1024);
    expect(compacted).toContain('Core Architectural Decisions');
    expect(compacted).toContain('Active Constraints & Requirements');
    expect(compacted).toContain('Explicitly Rejected Approaches');
  });
});
