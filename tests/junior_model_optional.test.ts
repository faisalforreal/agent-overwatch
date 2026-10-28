import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { resolveConfig } from '../src/config.js';
import { validateMentorSuperiority } from '../src/tiers.js';
import {
  OverwatchPlanCheckInputSchema,
  OverwatchStatusInputSchema,
  OverwatchReviewInputSchema,
} from '../src/types.js';
import { executeStatus } from '../src/tools/status.js';
import { ProviderRouter } from '../src/providers/router.js';
import { MockProvider } from '../src/providers/mock.js';

describe('Optional Junior Model & Runtime Auto-Detection Suite', () => {
  const dummyConfigFile = path.join(os.tmpdir(), `dummy-config-${Date.now()}.json`);

  it('defaults juniorModel to auto when not specified in config', () => {
    const config = resolveConfig({}, dummyConfigFile);
    expect(config.juniorModel).toBe('auto');
  });

  it('validates mentor superiority seamlessly when juniorModel is auto or omitted', () => {
    const resAuto = validateMentorSuperiority('claude-opus-5', 'auto');
    expect(resAuto.valid).toBe(true);
    expect(resAuto.juniorTier).toBe('auto');
    expect(resAuto.warning).toBeUndefined();

    const resOmitted = validateMentorSuperiority('claude-3-7-sonnet');
    expect(resOmitted.valid).toBe(true);
    expect(resOmitted.juniorTier).toBe('auto');
    expect(resOmitted.warning).toBeUndefined();
  });

  it('still enforces strict tier hierarchy when an explicit junior model is provided', () => {
    // Valid: Frontier > Medium
    const validRes = validateMentorSuperiority('claude-opus-5', 'gemini-2.0-flash');
    expect(validRes.valid).toBe(true);

    // Invalid: Medium > Medium
    const invalidRes = validateMentorSuperiority('gemini-2.0-flash', 'gemini-3.8-flash');
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.warning).toBeDefined();
  });

  it('accepts optional junior_model across tool input schemas', () => {
    const planParsed = OverwatchPlanCheckInputSchema.parse({
      user_goal: 'Refactor database client',
      proposed_plan: '1. Add pooling\n2. Update tests',
      junior_model: 'gemini-3.8-flash',
    });
    expect(planParsed.junior_model).toBe('gemini-3.8-flash');

    const statusParsed = OverwatchStatusInputSchema.parse({
      junior_model: 'claude-3-5-haiku',
    });
    expect(statusParsed.junior_model).toBe('claude-3-5-haiku');

    const reviewParsed = OverwatchReviewInputSchema.parse({
      user_goal: 'Review diff',
      junior_model: 'gpt-4o-mini',
    });
    expect(reviewParsed.junior_model).toBe('gpt-4o-mini');
  });

  it('reports Auto-detected client agent in status when juniorModel is auto', async () => {
    const config = resolveConfig({ juniorModel: 'auto', mentorModel: 'claude-opus-5' }, dummyConfigFile);
    const mockProvider = new MockProvider();
    const router = new ProviderRouter(config, mockProvider);

    const { status, markdown } = await executeStatus(config, router);
    expect(status.juniorModel).toBe('auto');
    expect(status.tierValidation.valid).toBe(true);
    expect(markdown).toContain('Auto-detected (Client Agent)');
  });

  it('allows runtimeJuniorModel override in executeStatus', async () => {
    const config = resolveConfig({ juniorModel: 'auto', mentorModel: 'claude-opus-5' }, dummyConfigFile);
    const mockProvider = new MockProvider();
    const router = new ProviderRouter(config, mockProvider);

    const { status, markdown } = await executeStatus(
      config,
      router,
      undefined,
      'gemini-3.8-flash'
    );
    expect(status.juniorModel).toBe('gemini-3.8-flash');
    expect(status.tierValidation.valid).toBe(true);
    expect(markdown).toContain('gemini-3.8-flash');
  });
});
