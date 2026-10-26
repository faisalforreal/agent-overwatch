import { OverwatchVerifyInput, OverwatchFeedback } from '../types.js';
import { ProviderRouter } from '../providers/router.js';
import { ProgressCallback } from '../providers/base.js';
import { OVERWATCH_SYSTEM_PROMPT } from '../prompts/system.js';
import { buildVerifyPrompt } from '../prompts/templates.js';
import { formatFeedbackAsMarkdown } from '../prompts/parser.js';
import { gatherGitContext } from '../context/git.js';
import { readRepoNotes, appendRepoNotes } from '../context/notes.js';
import { checkBudget, recordCallUsage } from '../budget/tracker.js';

export async function executeVerify(
  input: OverwatchVerifyInput,
  router: ProviderRouter,
  maxBudgetCalls?: number,
  onProgress?: ProgressCallback
): Promise<{ feedback: OverwatchFeedback; markdown: string }> {
  const budget = checkBudget(maxBudgetCalls);
  if (!budget.allowed) {
    const budgetFb: OverwatchFeedback = {
      verdict: 'APPROVED',
      summary: budget.message || 'Session call cap reached.',
      defects: [],
      optimizations: [],
      next_steps: ['Perform self-verification using test suite.'],
      avoid: [],
      coaching_prompt: 'Run test suite and confirm all tests pass.',
      notes_to_save: [],
    };
    return { feedback: budgetFb, markdown: formatFeedbackAsMarkdown(budgetFb) };
  }

  if (onProgress) onProgress(10, 100, 'Gathering git diff and test output...');
  const gitCtx = gatherGitContext(input.repo_path, input.base_ref);
  const notes = readRepoNotes(input.repo_path);

  const prompt = buildVerifyPrompt(input, {
    gitDiff: gitCtx.gitDiff,
    gitStatus: gitCtx.gitStatus,
    notes,
  });

  if (onProgress) onProgress(25, 100, 'Submitting diff and test results to mentor for verification...');

  const feedback = await router.executeReviewWithFallbacks({
    systemPrompt: OVERWATCH_SYSTEM_PROMPT,
    userPrompt: prompt,
    notesContext: notes,
    onProgress,
  });

  if (feedback.notes_to_save && feedback.notes_to_save.length > 0) {
    appendRepoNotes(input.repo_path, feedback.notes_to_save);
  }

  recordCallUsage(input.repo_path, 'overwatch_verify', 'mentor', feedback.usage);

  return {
    feedback,
    markdown: formatFeedbackAsMarkdown(feedback),
  };
}
