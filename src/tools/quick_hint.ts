import { OverwatchQuickHintInput, OverwatchFeedback } from '../types.js';
import { ProviderRouter } from '../providers/router.js';
import { ProgressCallback } from '../providers/base.js';
import { OVERWATCH_SYSTEM_PROMPT } from '../prompts/system.js';
import { buildQuickHintPrompt } from '../prompts/templates.js';
import { formatFeedbackAsMarkdown } from '../prompts/parser.js';
import { checkBudget, recordCallUsage } from '../budget/tracker.js';
import { TOOL_QUICK_HINT } from '../constants.js';

export async function executeQuickHint(
  input: OverwatchQuickHintInput,
  router: ProviderRouter,
  repoPath?: string,
  maxBudgetCalls?: number,
  onProgress?: ProgressCallback,
  timeoutMs?: number
): Promise<{ feedback: OverwatchFeedback; markdown: string }> {
  const budget = checkBudget(maxBudgetCalls);
  if (!budget.allowed) {
    const budgetFb: OverwatchFeedback = {
      verdict: 'APPROVED',
      summary: budget.message || 'Session call cap reached.',
      defects: [],
      optimizations: [],
      next_steps: ['Investigate the error log directly and try a targeted test.'],
      avoid: [],
      coaching_prompt: 'Diagnose the stack trace directly and fix.',
      notes_to_save: [],
    };
    return { feedback: budgetFb, markdown: formatFeedbackAsMarkdown(budgetFb) };
  }

  const prompt = buildQuickHintPrompt(input);

  const feedback = await router.executeReviewWithFallbacks({
    systemPrompt: OVERWATCH_SYSTEM_PROMPT,
    userPrompt: prompt,
    onProgress,
    timeoutMs,
  });

  const targetRepo = repoPath || input.repo_path || process.cwd();
  recordCallUsage(targetRepo, TOOL_QUICK_HINT, 'mentor', feedback.usage);

  return {
    feedback,
    markdown: formatFeedbackAsMarkdown(feedback),
  };
}
