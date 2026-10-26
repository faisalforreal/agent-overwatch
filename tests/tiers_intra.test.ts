import { describe, it, expect } from 'vitest';
import { validateMentorSuperiority } from '../src/tiers.js';

describe('Intra-Tier Capability Ordering Suite', () => {
  it('correctly orders models within the frontier tier', () => {
    // Fable 5.1 (ordinal 3) mentoring Claude Opus (ordinal 2) -> VALID
    const res1 = validateMentorSuperiority('fable-5.1', 'claude-3-opus');
    expect(res1.valid).toBe(true);
    expect(res1.isIntraTier).toBe(true);
    expect(res1.mentorOrdinal).toBe(3);
    expect(res1.juniorOrdinal).toBe(2);

    // Claude Opus (ordinal 2) mentoring Fable 5.1 (ordinal 3) -> INVALID
    const res2 = validateMentorSuperiority('claude-3-opus', 'fable-5.1');
    expect(res2.valid).toBe(false);
    expect(res2.isIntraTier).toBe(true);
    expect(res2.warning).toContain('not stronger');

    // Claude Opus mentoring Claude Opus (identical ordinal 2) -> INVALID without allowSameTier
    const res3 = validateMentorSuperiority('claude-3-opus', 'claude-3-opus');
    expect(res3.valid).toBe(false);
    expect(res3.isIntraTier).toBe(true);

    // Claude Opus mentoring Claude Opus with allowSameTier: true -> VALID (overridable)
    const res4 = validateMentorSuperiority('claude-3-opus', 'claude-3-opus', {
      allowSameTier: true,
    });
    expect(res4.valid).toBe(true);
    expect(res4.warning).toContain('Same-tier pairing allowed');
  });

  it('correctly orders models within the strong tier', () => {
    // DeepSeek R1 (ordinal 3) mentoring Claude 3.5 Sonnet (ordinal 2) -> VALID
    const res1 = validateMentorSuperiority('deepseek-r1', 'claude-3-5-sonnet');
    expect(res1.valid).toBe(true);
    expect(res1.isIntraTier).toBe(true);
    expect(res1.mentorOrdinal).toBe(3);
    expect(res1.juniorOrdinal).toBe(2);

    // GPT-4o (ordinal 2) mentoring DeepSeek R1 (ordinal 3) -> INVALID
    const res2 = validateMentorSuperiority('gpt-4o', 'deepseek-r1');
    expect(res2.valid).toBe(false);
    expect(res2.isIntraTier).toBe(true);
  });

  it('validates across distinct tiers', () => {
    // Frontier vs Medium -> VALID
    const res1 = validateMentorSuperiority('fable-5.1', 'gemini-2.0-flash');
    expect(res1.valid).toBe(true);
    expect(res1.isIntraTier).toBe(false);

    // Medium vs Frontier -> INVALID
    const res2 = validateMentorSuperiority('gemini-2.0-flash', 'fable-5.1');
    expect(res2.valid).toBe(false);
    expect(res2.isIntraTier).toBe(false);
    expect(res2.warning).toContain('lower capability tier');
  });
});
