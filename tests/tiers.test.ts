import { describe, it, expect } from 'vitest';
import { getModelTier, validateMentorSuperiority, compareTiers } from '../src/tiers.js';

describe('Tier Validation Engine', () => {
  it('correctly maps frontier models', () => {
    expect(getModelTier('claude-opus-5').tier).toBe('frontier');
    expect(getModelTier('anthropic/claude-3-opus-20240229').tier).toBe('frontier');
    expect(getModelTier('bedrock/anthropic.claude-3-opus-20240229-v1:0').tier).toBe('frontier');
    expect(getModelTier('fable-5.1').tier).toBe('frontier');
    expect(getModelTier('o3-mini').tier).toBe('frontier');
    expect(getModelTier('openai/o1').tier).toBe('frontier');
  });

  it('correctly maps strong models', () => {
    expect(getModelTier('claude-3-5-sonnet').tier).toBe('strong');
    expect(getModelTier('claude-3-7-sonnet').tier).toBe('strong');
    expect(getModelTier('bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0').tier).toBe('strong');
    expect(getModelTier('amazon.nova-pro-v1:0').tier).toBe('strong');
    expect(getModelTier('llama-3.3-70b-instruct').tier).toBe('strong');
    expect(getModelTier('qwen/qwen-2.5-coder-32b').tier).toBe('strong');
    expect(getModelTier('mistral-large-latest').tier).toBe('strong');
    expect(getModelTier('deepseek/deepseek-r1').tier).toBe('strong');
    expect(getModelTier('gpt-4o').tier).toBe('strong');
    expect(getModelTier('gemini-2.0-pro').tier).toBe('strong');
  });

  it('correctly maps medium and junior models', () => {
    expect(getModelTier('gemini-3.8-flash').tier).toBe('medium');
    expect(getModelTier('google/gemini-2.0-flash').tier).toBe('medium');
    expect(getModelTier('claude-3-5-haiku').tier).toBe('medium');
    expect(getModelTier('gpt-4o-mini').tier).toBe('medium');
  });

  it('correctly maps small models', () => {
    expect(getModelTier('gemini-flash-8b').tier).toBe('small');
    expect(getModelTier('gpt-3.5-turbo').tier).toBe('small');
    expect(getModelTier('qwen/qwen-2.5-coder-7b').tier).toBe('small');
  });

  it('validates that mentor is strictly stronger than junior', () => {
    // Frontier mentor vs Medium junior -> Valid
    const res1 = validateMentorSuperiority('claude-opus-5', 'gemini-3.8-flash');
    expect(res1.valid).toBe(true);
    expect(res1.warning).toBeUndefined();

    // Strong mentor vs Medium junior -> Valid
    const res2 = validateMentorSuperiority('claude-3-5-sonnet', 'gemini-3.8-flash');
    expect(res2.valid).toBe(true);

    // Medium mentor vs Medium junior -> INVALID
    const res3 = validateMentorSuperiority('gemini-2.0-flash', 'gemini-3.8-flash');
    expect(res3.valid).toBe(false);
    expect(res3.warning).toContain('not stronger');

    // Small mentor vs Medium junior -> INVALID
    const res4 = validateMentorSuperiority('gpt-3.5-turbo', 'gemini-3.8-flash');
    expect(res4.valid).toBe(false);
  });

  it('handles unknown models with heuristic warning', () => {
    const unknownRes = validateMentorSuperiority('claude-opus-5', 'brand-new-custom-model-2026');
    expect(unknownRes.valid).toBe(true);
    expect(unknownRes.juniorIsUnknown).toBe(true);
    expect(unknownRes.warning).toContain('Heuristic tier warning');
  });

  it('respects custom additional models when provided', () => {
    const customModels = [
      {
        pattern: '^my-internal-supermodel.*',
        tier: 'frontier' as const,
        ordinal: 3,
        reasoning: true,
        description: 'Internal fine-tuned model',
        inputCostPerMillion: 2.0,
        outputCostPerMillion: 8.0,
      },
    ];

    const match = getModelTier('my-internal-supermodel-v1', undefined, customModels);
    expect(match.tier).toBe('frontier');
    expect(match.isUnknown).toBe(false);

    const validation = validateMentorSuperiority(
      'my-internal-supermodel-v1',
      'gemini-2.0-flash',
      { customModels }
    );
    expect(validation.valid).toBe(true);
    expect(validation.mentorTier).toBe('frontier');
  });
});
