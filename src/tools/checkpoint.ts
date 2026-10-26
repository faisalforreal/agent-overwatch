import { OverwatchCheckpointInput, OverwatchFeedback } from '../types.js';
import { ProviderRouter } from '../providers/router.js';
import { OVERWATCH_SYSTEM_PROMPT } from '../prompts/system.js';
import { buildCheckpointPrompt } from '../prompts/templates.js';
import { formatFeedbackAsMarkdown } from '../prompts/parser.js';
import { gatherGitContext } from '../context/git.js';
import { readRepoNotes, appendRepoNotes } from '../context/notes.js';
import { checkBudget, recordCallUsage } from '../budget/tracker.js';

export async function executeCheckpoint(
  input: OverwatchCheckpointInput,
  router: ProviderRouter,
  maxBudgetCalls?: number
): Promise<{ feedback: OverwatchFeedback; markdown: string }> {
  const budget = checkBudget(maxBudgetCalls);
  if (!budget.allowed) {
    const budgetFb: OverwatchFeedback = {
      verdict: 'APPROVED',
      summary: budget.message || 'Session call cap reached.',
      defects: [],
      optimizations: [],
      next_steps: ['Proceed independently with the remaining implementation.'],
      avoid: [],
      coaching_prompt: 'Execute your next step directly.',
      notes_to_save: [],
    };
    return { feedback: budgetFb, markdown: formatFeedbackAsMarkdown(budgetFb) };
  }

  let gitDiff = '';
  let gitStatus = '';
  let notes = '';

  if (input.repo_path) {
    const gitCtx = gatherGitContext(input.repo_path);
    gitDiff = gitCtx.gitDiff || '';
    gitStatus = gitCtx.gitStatus || '';
    notes = readRepoNotes(input.repo_path);
  }

  const prompt = buildCheckpointPrompt(input, {
    gitDiff,
    gitStatus,
    notes,
  });

  const feedback = await router.executeReviewWithFallbacks({
    systemPrompt: OVERWATCH_SYSTEM_PROMPT,
    userPrompt: prompt,
    notesContext: notes,
  });

  if (input.repo_path && feedback.notes_to_save && feedback.notes_to_save.length > 0) {
    appendRepoNotes(input.repo_path, feedback.notes_to_save);
  }

  recordCallUsage(input.repo_path, 'overwatch_checkpoint', 'mentor', feedback.usage);

  return {
    feedback,
    markdown: formatFeedbackAsMarkdown(feedback),
  };
}
