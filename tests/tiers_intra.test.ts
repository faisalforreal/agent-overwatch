import { describe, it, expect } from 'vitest';
import { validateMentorSuperiority, getModelTier } from '../src/tiers.js';

describe('Intra-Tier Capability Ordering Suite', () => {
  it('correctly orders models within the frontier tier', () => {
    // Fable 5.1 (rank 98) mentoring Claude Opus (rank 96) -> VALID
    const res1 = validateMentorSuperiority('fable-5.1', 'claude-opus-5');
    expect(res1.valid).toBe(true);
    expect(res1.isIntraTier).toBe(true);
    expect(res1.mentorRank).toBe(98);
    expect(res1.juniorRank).toBe(96);
    expect(res1.warning).toBeUndefined();

    // Claude Opus (rank 96) mentoring Fable 5.1 (rank 98) -> INVALID (mentor rank lower)
    const res2 = validateMentorSuperiority('claude-opus-5', 'fable-5.1');
    expect(res2.valid).toBe(false);
    expect(res2.isIntraTier).toBe(true);
    expect(res2.warning).toContain('is NOT stronger than junior model');

    // Claude Opus (rank 96) mentoring Claude Opus (rank 96) -> INVALID (identical rank)
    const res3 = validateMentorSuperiority('claude-opus-5', 'claude-opus-5');
    expect(res3.valid).toBe(false);
    expect(res3.isIntraTier).toBe(true);
    expect(res3.warning).toContain('identical capability rank (96)');

    // Gemini 4-Argon (rank 95) mentoring Claude 3.7 Sonnet (rank 88) -> VALID
    const res4 = validateMentorSuperiority('gemini-4-argon', 'claude-3-7-sonnet');
    expect(res4.valid).toBe(true);
    expect(res4.isIntraTier).toBe(true);
    expect(res4.mentorRank).toBe(95);
    expect(res4.juniorRank).toBe(88);
  });

  it('correctly orders models within the strong tier', () => {
    // DeepSeek R1 (rank 82) mentoring Claude 3.5 Sonnet (rank 78) -> VALID
    const res1 = validateMentorSuperiority('deepseek-r1', 'claude-3-5-sonnet');
    expect(res1.valid).toBe(true);
    expect(res1.isIntraTier).toBe(true);
    expect(res1.mentorRank).toBe(82);
    expect(res1.juniorRank).toBe(78);

    // GPT-4o (rank 76) mentoring DeepSeek R1 (rank 82) -> INVALID
    const res2 = validateMentorSuperiority('gpt-4o', 'deepseek-r1');
    expect(res2.valid).toBe(false);
    expect(res2.isIntraTier).toBe(true);
  });

  it('validates across distinct tiers', () => {
    // Frontier vs Medium
    const res1 = validateMentorSuperiority('fable-5.1', 'gemini-3.8-flash');
    expect(res1.valid).toBe(true);
    expect(res1.isIntraTier).toBe(false);

    // Medium vs Frontier -> INVALID
    const res2 = validateMentorSuperiority('gemini-3.8-flash', 'fable-5.1');
    expect(res2.valid).toBe(false);
    expect(res2.isIntraTier).toBe(false);
    expect(res2.warning).toContain('lower capability tier');
  });
});
