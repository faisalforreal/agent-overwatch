import { describe, it, expect } from 'vitest';
import { parseOverwatchFeedback, formatFeedbackAsMarkdown } from '../src/prompts/parser.js';
import { MockProvider } from '../src/providers/mock.js';
import { ProviderRouter } from '../src/providers/router.js';
import { resolveConfig } from '../src/config.js';
import { APP_NAME } from '../src/constants.js';

describe('Providers & Parser Layer', () => {
  it('parses clean JSON fences seamlessly', () => {
    const raw = `\`\`\`json
{
  "verdict": "APPROVED",
  "summary": "Implementation looks great.",
  "defects": [],
  "optimizations": [],
  "next_steps": ["Deploy to staging"],
  "avoid": ["Manual database edits"],
  "coaching_prompt": "Run tests and ship.",
  "notes_to_save": ["Using Redis for sessions"]
}
\`\`\``;

    const parsed = parseOverwatchFeedback(raw);
    expect(parsed.verdict).toBe('APPROVED');
    expect(parsed.summary).toBe('Implementation looks great.');
    expect(parsed.next_steps).toEqual(['Deploy to staging']);
    expect(parsed.notes_to_save).toEqual(['Using Redis for sessions']);
  });

  it('repairs trailing commas gracefully', () => {
    const raw = `{
  "verdict": "NEEDS_REFINEMENT",
  "summary": "Fix syntax error.",
  "defects": [
    {
      "severity": "high",
      "location": "src/app.ts:42",
      "explanation": "Off by one error in loop",
      "suggested_fix": "Change < to <="
    },
  ],
  "optimizations": [],
  "next_steps": ["Fix loop condition"],
  "avoid": [],
  "coaching_prompt": "Fix line 42."
}`;

    const parsed = parseOverwatchFeedback(raw);
    expect(parsed.verdict).toBe('NEEDS_REFINEMENT');
    expect(parsed.defects.length).toBe(1);
    expect(parsed.defects[0].location).toBe('src/app.ts:42');
  });

  it('falls back to synthesized markdown feedback if JSON is completely corrupted', () => {
    const rawMarkdown = `VERDICT: CRITICAL_REVISION
The plan completely ignores the database migrations.
1. Run migrations first
2. Verify rollback works`;

    const parsed = parseOverwatchFeedback(rawMarkdown);
    expect(parsed.verdict).toBe('CRITICAL_REVISION');
    expect(parsed.next_steps.length).toBeGreaterThanOrEqual(1);
  });

  it('formats feedback as clean readable Markdown', () => {
    const fb = {
      verdict: 'APPROVED' as const,
      summary: 'All checks passed.',
      defects: [],
      optimizations: [{ type: 'performance' as const, description: 'Cache queries', impact: '2x' }],
      next_steps: ['Merge branch'],
      avoid: ['Force pushing'],
      coaching_prompt: 'Merge and tag release.',
      notes_to_save: ['Cache TTL set to 60s'],
    };

    const md = formatFeedbackAsMarkdown(fb);
    const titleName = APP_NAME.charAt(0).toUpperCase() + APP_NAME.slice(1);
    expect(md).toContain(`${titleName} Verdict: ✅ **APPROVED**`);
    expect(md).toContain('Cache queries');
    expect(md).toContain('Merge branch');
  });

  it('ProviderRouter handles fallback ladder when primary provider fails', async () => {
    const config = resolveConfig();
    config.mentorModel = 'primary-failing-model';
    config.mentorFallbacks = [{ provider: 'mock', model: 'fallback-working-model' }];

    const failingMock = new MockProvider({ shouldFail: true, failureMessage: 'Quota Exceeded' });
    const router = new ProviderRouter(config, failingMock);

    // Primary should fail, but then router will throw if all fallbacks fail (unless secondary is working)
    await expect(
      router.executeReviewWithFallbacks({
        systemPrompt: 'test',
        userPrompt: 'test',
      })
    ).rejects.toThrow('All mentor provider attempts failed');
  });

  it('ProviderRouter executes successfully with working mock provider', async () => {
    const config = resolveConfig();
    const workingMock = new MockProvider();
    const router = new ProviderRouter(config, workingMock);

    const feedback = await router.executeReviewWithFallbacks({
      systemPrompt: 'test',
      userPrompt: 'test',
    });

    expect(feedback.verdict).toBe('APPROVED');
    expect(feedback.summary).toContain('Architectural plan');
  });

  it('routes to Bedrock provider when Bedrock keys and model are configured', () => {
    const config = resolveConfig({
      bedrockApiKey: 'test-bedrock-key',
      awsRegion: 'eu-west-1',
    });
    const router = new ProviderRouter(config);
    const route = router.resolveProviderForModel('bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0');
    expect(route.provider.name).toBe('bedrock');
    expect(route.model).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0');
  });

  it('routes to CustomProvider when customBaseUrl is set for any model', () => {
    const config = resolveConfig({
      customBaseUrl: 'http://localhost:11434/v1',
      customApiKey: 'ollama',
    });
    const router = new ProviderRouter(config);
    const route = router.resolveProviderForModel('llama3.3:70b');
    expect(route.provider.name).toBe('custom');
    expect(route.model).toBe('llama3.3:70b');
  });
});
