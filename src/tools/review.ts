import { OverwatchReviewInput, OverwatchFeedback } from '../types.js';
import { ProviderRouter } from '../providers/router.js';
import { ProgressCallback } from '../providers/base.js';
import { OVERWATCH_SYSTEM_PROMPT } from '../prompts/system.js';
import { buildReviewPrompt } from '../prompts/templates.js';
import { formatFeedbackAsMarkdown } from '../prompts/parser.js';
import { gatherGitContext } from '../context/git.js';
import { readRepoNotes, appendRepoNotes } from '../context/notes.js';
import { checkBudget, recordCallUsage } from '../budget/tracker.js';
import { validateMentorSuperiority } from '../tiers.js';

export async function executeReview(
  input: OverwatchReviewInput,
  router: ProviderRouter,
  juniorModel = 'gemini-2.0-flash',
  maxBudgetCalls?: number,
  onProgress?: ProgressCallback,
  timeoutMs?: number
): Promise<{ feedback: OverwatchFeedback; markdown: string }> {
  if (input.mentor_model) {
    const tierCheck = validateMentorSuperiority(input.mentor_model, juniorModel);
    if (!tierCheck.valid) {
      console.error(`[overwatch] Warning: ${tierCheck.warning}`);
    }
  }

  const budget = checkBudget(maxBudgetCalls);
  if (!budget.allowed) {
    const budgetFb: OverwatchFeedback = {
      verdict: 'APPROVED',
      summary: budget.message || 'Session call cap reached.',
      defects: [],
      optimizations: [],
      next_steps: ['Proceed independently to finalize the diff and tests.'],
      avoid: [],
      coaching_prompt: 'Run tests and verify independently.',
      notes_to_save: [],
    };
    return { feedback: budgetFb, markdown: formatFeedbackAsMarkdown(budgetFb) };
  }

  let gitDiff = input.draft_code_or_diff || '';
  let notes = '';

  if (input.repo_path) {
    if (onProgress) onProgress(10, 100, 'Gathering git diff across repository...');
    const gitCtx = gatherGitContext(input.repo_path);
    if (gitCtx.gitDiff) {
      gitDiff = gitCtx.gitDiff;
    }
    notes = readRepoNotes(input.repo_path);
  }

  const prompt = buildReviewPrompt(input, {
    gitDiff,
    fileContext: input.file_context,
    notes,
  });

  if (onProgress) onProgress(25, 100, 'Submitting diff to mentor model for audit...');

  const feedback = await router.executeReviewWithFallbacks({
    systemPrompt: OVERWATCH_SYSTEM_PROMPT,
    userPrompt: prompt,
    notesContext: notes,
    model: input.mentor_model,
    onProgress,
    timeoutMs,
  });

  if (input.repo_path && feedback.notes_to_save && feedback.notes_to_save.length > 0) {
    appendRepoNotes(input.repo_path, feedback.notes_to_save);
  }

  recordCallUsage(
    input.repo_path,
    'overwatch_review',
    input.mentor_model || 'mentor',
    feedback.usage
  );

  return {
    feedback,
    markdown: formatFeedbackAsMarkdown(feedback),
  };
}
