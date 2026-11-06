import { OverwatchVerifyInput, OverwatchFeedback } from '../types.js';
import { ProviderRouter } from '../providers/router.js';
import { ProgressCallback } from '../providers/base.js';
import { OVERWATCH_SYSTEM_PROMPT } from '../prompts/system.js';
import { buildVerifyPrompt } from '../prompts/templates.js';
import { formatFeedbackAsMarkdown } from '../prompts/parser.js';
import { gatherGitContext } from '../context/git.js';
import { gatherDeepRepoContext } from '../context/files.js';
import { readRepoNotes, appendRepoNotes } from '../context/notes.js';
import { synchronizeCatchUpContext } from '../context/catchup.js';
import { checkBudget, recordCallUsage } from '../budget/tracker.js';
import { TOOL_VERIFY } from '../constants.js';

export async function executeVerify(
  input: OverwatchVerifyInput,
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
      next_steps: ['Perform self-verification using test suite.'],
      avoid: [],
      coaching_prompt: 'Run test suite and confirm all tests pass.',
      notes_to_save: [],
    };
    return { feedback: budgetFb, markdown: formatFeedbackAsMarkdown(budgetFb) };
  }

  const repoPath = input.repo_path || process.cwd();

  if (onProgress) onProgress(10, 100, 'Gathering git diff, status, and file context for verification...');

  // 1. Synchronize mid-session catch-up context
  const catchUp = synchronizeCatchUpContext(repoPath, {
    sessionContext: input.session_context,
    toolName: TOOL_VERIFY,
  });

  const gitCtx = gatherGitContext(repoPath, input.base_ref);
  const notes = readRepoNotes(repoPath);
  const repoTree = gitCtx.repoTree || '';

  // 2. Gather deep repository context (existing relevant files, prompt-detected files, untracked, modified, 1-hop imports)
  const deepFiles = gatherDeepRepoContext(repoPath, {
    explicitFiles: input.relevant_files,
    modifiedFiles: gitCtx.modifiedFiles,
    untrackedFiles: gitCtx.untrackedFiles,
    textContext: `${input.user_goal}\n${input.test_results || ''}`,
  });
  const relevantFilesContent = deepFiles.combinedFormatted;

  const prompt = buildVerifyPrompt(input, {
    gitDiff: gitCtx.gitDiff,
    gitStatus: gitCtx.gitStatus,
    repoTree,
    relevantFilesContent,
    catchUpSummary: catchUp.catchUpSummary,
    notes,
  });

  if (onProgress) onProgress(25, 100, 'Submitting diff, files, and test results to mentor for verification...');

  const feedback = await router.executeReviewWithFallbacks({
    model: input.mentor_model,
    mentorProvider: input.mentor_provider,
    systemPrompt: OVERWATCH_SYSTEM_PROMPT,
    userPrompt: prompt,
    notesContext: notes,
    onProgress,
    timeoutMs,
  });

  if (feedback.notes_to_save && feedback.notes_to_save.length > 0) {
    appendRepoNotes(repoPath, feedback.notes_to_save);
  }

  recordCallUsage(repoPath, TOOL_VERIFY, feedback.modelUsed || input.mentor_model || 'mentor', feedback.usage);

  return {
    feedback,
    markdown: formatFeedbackAsMarkdown(feedback),
  };
}
