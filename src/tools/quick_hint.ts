import { OverwatchQuickHintInput, OverwatchFeedback } from '../types.js';
import { ProviderRouter } from '../providers/router.js';
import { ProgressCallback } from '../providers/base.js';
import { OVERWATCH_SYSTEM_PROMPT } from '../prompts/system.js';
import { buildQuickHintPrompt } from '../prompts/templates.js';
import { formatFeedbackAsMarkdown } from '../prompts/parser.js';
import { gatherDeepRepoContext } from '../context/files.js';
import { readRepoNotes } from '../context/notes.js';
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
  const targetRepo = repoPath || input.repo_path || process.cwd();
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

  const notes = readRepoNotes(targetRepo);
  const deepFiles = gatherDeepRepoContext(targetRepo, {
    explicitFiles: input.relevant_files,
    textContext: `${input.problem_description}\n${input.error_or_log}\n${input.attempted_fix || ''}`,
    fastMode: true,
  });

  const prompt = buildQuickHintPrompt(input, {
    notes,
    relevantFilesContent: deepFiles.combinedFormatted,
  });

  const feedback = await router.executeReviewWithFallbacks({
    model: input.mentor_model,
    mentorProvider: input.mentor_provider,
    systemPrompt: OVERWATCH_SYSTEM_PROMPT,
    userPrompt: prompt,
    notesContext: notes,
    onProgress,
    timeoutMs,
  });

  recordCallUsage(targetRepo, TOOL_QUICK_HINT, feedback.modelUsed || input.mentor_model || 'mentor', feedback.usage);

  return {
    feedback,
    markdown: formatFeedbackAsMarkdown(feedback),
  };
}
