import { OverwatchPlanCheckInput, OverwatchFeedback } from '../types.js';
import { ProviderRouter } from '../providers/router.js';
import { ProgressCallback } from '../providers/base.js';
import { OVERWATCH_SYSTEM_PROMPT } from '../prompts/system.js';
import { buildPlanCheckPrompt } from '../prompts/templates.js';
import { formatFeedbackAsMarkdown } from '../prompts/parser.js';
import { gatherGitContext } from '../context/git.js';
import { gatherRelevantFiles } from '../context/files.js';
import { readRepoNotes, appendRepoNotes } from '../context/notes.js';
import { checkBudget, recordCallUsage } from '../budget/tracker.js';
import { TOOL_PLAN_CHECK } from '../constants.js';

export async function executePlanCheck(
  input: OverwatchPlanCheckInput,
  router: ProviderRouter,
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
      next_steps: ['Proceed independently according to the current proposed plan.'],
      avoid: [],
      coaching_prompt: 'Session call cap reached. Execute the plan directly.',
      notes_to_save: [],
    };
    return { feedback: budgetFb, markdown: formatFeedbackAsMarkdown(budgetFb) };
  }

  const repoPath = input.repo_path || process.cwd();
  if (onProgress) onProgress(10, 100, 'Gathering repository status and context files...');
  const gitCtx = gatherGitContext(repoPath);
  const gitStatus = gitCtx.gitStatus || '';
  const filesCtx = gatherRelevantFiles(repoPath, input.relevant_files);
  const relevantFilesContent = filesCtx.combinedFormatted;
  const notes = readRepoNotes(repoPath);

  const prompt = buildPlanCheckPrompt(input, {
    gitStatus,
    relevantFilesContent,
    notes,
  });

  if (onProgress) onProgress(20, 100, 'Submitting plan to mentor model for architectural check...');

  const feedback = await router.executeReviewWithFallbacks({
    systemPrompt: OVERWATCH_SYSTEM_PROMPT,
    userPrompt: prompt,
    notesContext: notes,
    onProgress,
    timeoutMs,
  });

  if (repoPath && feedback.notes_to_save && feedback.notes_to_save.length > 0) {
    appendRepoNotes(repoPath, feedback.notes_to_save);
  }

  recordCallUsage(repoPath, TOOL_PLAN_CHECK, 'mentor', feedback.usage);

  return {
    feedback,
    markdown: formatFeedbackAsMarkdown(feedback),
  };
}
