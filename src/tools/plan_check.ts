import { OverwatchPlanCheckInput, OverwatchFeedback } from '../types.js';
import { ProviderRouter } from '../providers/router.js';
import { OVERWATCH_SYSTEM_PROMPT } from '../prompts/system.js';
import { buildPlanCheckPrompt } from '../prompts/templates.js';
import { formatFeedbackAsMarkdown } from '../prompts/parser.js';
import { gatherGitContext } from '../context/git.js';
import { gatherRelevantFiles } from '../context/files.js';
import { readRepoNotes, appendRepoNotes } from '../context/notes.js';
import { checkBudget, recordCallUsage } from '../budget/tracker.js';

export async function executePlanCheck(
  input: OverwatchPlanCheckInput,
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
      next_steps: ['Proceed independently according to the current proposed plan.'],
      avoid: [],
      coaching_prompt: 'Session call cap reached. Execute the plan directly.',
      notes_to_save: [],
    };
    return { feedback: budgetFb, markdown: formatFeedbackAsMarkdown(budgetFb) };
  }

  let gitStatus = '';
  let relevantFilesContent = '';
  let notes = '';

  if (input.repo_path) {
    const gitCtx = gatherGitContext(input.repo_path);
    gitStatus = gitCtx.gitStatus || '';
    const filesCtx = gatherRelevantFiles(input.repo_path, input.relevant_files);
    relevantFilesContent = filesCtx.combinedFormatted;
    notes = readRepoNotes(input.repo_path);
  }

  const prompt = buildPlanCheckPrompt(input, {
    gitStatus,
    relevantFilesContent,
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

  recordCallUsage(input.repo_path, 'overwatch_plan_check', 'mentor', feedback.usage);

  return {
    feedback,
    markdown: formatFeedbackAsMarkdown(feedback),
  };
}
