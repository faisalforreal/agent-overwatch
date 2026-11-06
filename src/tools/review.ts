import { OverwatchReviewInput, OverwatchFeedback } from '../types.js';
import { ProviderRouter } from '../providers/router.js';
import { ProgressCallback } from '../providers/base.js';
import { OVERWATCH_SYSTEM_PROMPT } from '../prompts/system.js';
import { buildReviewPrompt } from '../prompts/templates.js';
import { formatFeedbackAsMarkdown } from '../prompts/parser.js';
import { gatherGitContext } from '../context/git.js';
import { gatherDeepRepoContext } from '../context/files.js';
import { readRepoNotes, appendRepoNotes } from '../context/notes.js';
import { synchronizeCatchUpContext } from '../context/catchup.js';
import { checkBudget, recordCallUsage } from '../budget/tracker.js';
import { validateMentorSuperiority, getModelDefaults } from '../tiers.js';
import { TOOL_REVIEW, LOG_PREFIX } from '../constants.js';

export async function executeReview(
  input: OverwatchReviewInput,
  router: ProviderRouter,
  juniorModel?: string,
  maxBudgetCalls?: number,
  onProgress?: ProgressCallback,
  timeoutMs?: number
): Promise<{ feedback: OverwatchFeedback; markdown: string }> {
  const resolvedJunior = juniorModel || getModelDefaults().junior;

  if (input.mentor_model) {
    const tierCheck = validateMentorSuperiority(input.mentor_model, resolvedJunior);
    if (!tierCheck.valid) {
      console.error(`${LOG_PREFIX} Warning: ${tierCheck.warning}`);
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

  const repoPath = input.repo_path || process.cwd();

  // 1. Synchronize mid-session catch-up context
  const catchUp = synchronizeCatchUpContext(repoPath, {
    sessionContext: input.session_context,
    toolName: TOOL_REVIEW,
  });

  // Use the real git diff when repo_path was explicitly provided by the caller.
  // When only falling back to process.cwd(), the caller had no repo context — honour
  // their draft_code_or_diff instead of silently overwriting it with an unrelated diff.
  let gitDiff = input.draft_code_or_diff || '';
  let notes = readRepoNotes(repoPath);
  let repoTree = '';
  let modifiedFiles: string[] = [];
  let untrackedFiles: string[] = [];

  if (input.repo_path) {
    if (onProgress) onProgress(10, 100, 'Gathering git diff and file context across repository...');
    const gitCtx = gatherGitContext(repoPath);
    if (gitCtx.gitDiff) {
      gitDiff = gitCtx.gitDiff;
    }
    repoTree = gitCtx.repoTree || '';
    modifiedFiles = gitCtx.modifiedFiles || [];
    untrackedFiles = gitCtx.untrackedFiles || [];
  }

  // 2. Gather deep repository context (existing relevant files, prompt-detected files, untracked, modified, 1-hop imports)
  const deepFiles = gatherDeepRepoContext(repoPath, {
    explicitFiles: input.relevant_files,
    modifiedFiles,
    untrackedFiles,
    textContext: `${input.user_goal}\n${input.file_context || ''}\n${input.current_tests_or_errors || ''}`,
  });
  const relevantFilesContent = deepFiles.combinedFormatted;

  const prompt = buildReviewPrompt(input, {
    gitDiff,
    fileContext: input.file_context,
    repoTree,
    relevantFilesContent,
    catchUpSummary: catchUp.catchUpSummary,
    notes,
  });

  if (onProgress) onProgress(25, 100, 'Submitting diff to mentor model for audit...');

  const feedback = await router.executeReviewWithFallbacks({
    mentorProvider: input.mentor_provider,
    systemPrompt: OVERWATCH_SYSTEM_PROMPT,
    userPrompt: prompt,
    notesContext: notes,
    model: input.mentor_model,
    onProgress,
    timeoutMs,
  });

  if (repoPath && feedback.notes_to_save && feedback.notes_to_save.length > 0) {
    appendRepoNotes(repoPath, feedback.notes_to_save);
  }

  recordCallUsage(
    repoPath,
    TOOL_REVIEW,
    feedback.modelUsed || input.mentor_model || 'mentor',
    feedback.usage
  );

  return {
    feedback,
    markdown: formatFeedbackAsMarkdown(feedback),
  };
}
