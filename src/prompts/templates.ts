import {
  OverwatchPlanCheckInput,
  OverwatchCheckpointInput,
  OverwatchReviewInput,
  OverwatchQuickHintInput,
  OverwatchVerifyInput,
} from '../types.js';

export interface PromptContextData {
  gitDiff?: string;
  gitStatus?: string;
  notes?: string;
  repoTree?: string;
  relevantFilesContent?: string;
  catchUpSummary?: string;
  fileContext?: string;
}

export function buildPlanCheckPrompt(
  input: OverwatchPlanCheckInput,
  contextData?: PromptContextData
): string {
  let p = `## TASK: PLAN CHECK (Pre-Implementation Architectural Gate)\n\n`;
  p += `### User Goal:\n${input.user_goal}\n\n`;
  p += `### Proposed Plan by Junior Agent:\n${input.proposed_plan}\n\n`;

  if (input.architecture_context) {
    p += `### Architecture Context:\n${input.architecture_context}\n\n`;
  }

  if (contextData?.notes) {
    p += `### Project Memory (NOTES.md):\n${contextData.notes}\n\n`;
  }

  if (contextData?.catchUpSummary) {
    p += `### Mid-Session Catch-Up (Prior Context & Commits):\n${contextData.catchUpSummary}\n\n`;
  }

  if (contextData?.gitStatus) {
    p += `### Current Git Status:\n${contextData.gitStatus}\n\n`;
  }

  if (contextData?.repoTree) {
    p += `### Repository File Tree:\n\`\`\`\n${contextData.repoTree}\n\`\`\`\n\n`;
  }

  if (contextData?.relevantFilesContent) {
    p += `### Relevant Files in Repository (Existing, Untracked & Dependencies):\n${contextData.relevantFilesContent}\n\n`;
  }

  p += `Evaluate the junior agent's proposed plan. Does it solve the user's goal without breaking existing architecture? What edge cases, testing strategies, or failure modes are missing? Return your assessment in the required JSON format.`;
  return p;
}

export function buildCheckpointPrompt(
  input: OverwatchCheckpointInput,
  contextData?: PromptContextData
): string {
  let p = `## TASK: MILESTONE CHECKPOINT & STEERING\n\n`;
  p += `### User Goal:\n${input.user_goal}\n\n`;
  p += `### Junior Agent State:\n`;
  p += `- Completed Milestones: ${JSON.stringify(input.state.done)}\n`;
  p += `- About to do: ${input.state.about_to_do}\n`;
  if (input.state.failing) {
    p += `- Current Failing State: ${input.state.failing}\n`;
  }
  p += `\n`;

  if (input.error_log) {
    p += `### Error Log / Stack Trace:\n${input.error_log}\n\n`;
  }

  if (contextData?.notes) {
    p += `### Project Memory (NOTES.md):\n${contextData.notes}\n\n`;
  }

  if (contextData?.catchUpSummary) {
    p += `### Mid-Session Catch-Up (Prior Context & Commits):\n${contextData.catchUpSummary}\n\n`;
  }

  if (contextData?.gitStatus) {
    p += `### Current Git Status:\n${contextData.gitStatus}\n\n`;
  }

  if (contextData?.gitDiff) {
    p += `### Git Diff So Far:\n${contextData.gitDiff}\n\n`;
  }

  if (contextData?.repoTree) {
    p += `### Repository File Tree:\n\`\`\`\n${contextData.repoTree}\n\`\`\`\n\n`;
  }

  if (contextData?.relevantFilesContent) {
    p += `### Full File Context (Existing Relevant, Untracked & Imported Dependencies):\n${contextData.relevantFilesContent}\n\n`;
  }

  p += `Steer the junior agent. Check if the work completed so far is correct and if the planned next step is the optimal direction. Provide the next 3-5 concrete steps and a coaching prompt in the required JSON format.`;
  return p;
}

export function buildReviewPrompt(
  input: OverwatchReviewInput,
  contextData?: PromptContextData
): string {
  let p = `## TASK: CODE REVIEW & AUDIT\n\n`;
  p += `### User Goal:\n${input.user_goal}\n\n`;

  if (contextData?.notes) {
    p += `### Project Memory (NOTES.md):\n${contextData.notes}\n\n`;
  }

  if (contextData?.catchUpSummary) {
    p += `### Mid-Session Catch-Up (Prior Context & Commits):\n${contextData.catchUpSummary}\n\n`;
  }

  const diffToReview = contextData?.gitDiff || input.draft_code_or_diff;
  if (diffToReview) {
    p += `### Code / Git Diff to Review:\n${diffToReview}\n\n`;
  }

  const files = contextData?.fileContext || input.file_context;
  if (files) {
    p += `### Surrounding File Context:\n${files}\n\n`;
  }

  if (contextData?.repoTree) {
    p += `### Repository File Tree:\n\`\`\`\n${contextData.repoTree}\n\`\`\`\n\n`;
  }

  if (contextData?.relevantFilesContent) {
    p += `### Full File Context (Existing Relevant, Untracked & Imported Dependencies):\n${contextData.relevantFilesContent}\n\n`;
  }

  if (input.current_tests_or_errors) {
    p += `### Current Test Output / Errors:\n${input.current_tests_or_errors}\n\n`;
  }

  p += `Audit the code changes. Look for correctness, edge cases, race conditions, memory leaks, security flaws, and regressions. Return your structured review in the required JSON format.`;
  return p;
}

export function buildQuickHintPrompt(
  input: OverwatchQuickHintInput,
  contextData?: PromptContextData
): string {
  let p = `## TASK: QUICK DIAGNOSIS & HINT\n\n`;
  p += `### Stuck Problem:\n${input.problem_description}\n\n`;
  p += `### Error / Diagnostic Log:\n${input.error_or_log}\n\n`;
  if (input.attempted_fix) {
    p += `### Attempted Fix that Failed:\n${input.attempted_fix}\n\n`;
  }

  if (contextData?.notes) {
    p += `### Project Memory (NOTES.md):\n${contextData.notes}\n\n`;
  }

  if (contextData?.relevantFilesContent) {
    p += `### Relevant Files in Repository:\n${contextData.relevantFilesContent}\n\n`;
  }

  p += `Diagnose the root cause concisely to break the junior model out of its debug loop. Suggest the exact fix in the required JSON format.`;
  return p;
}

export function buildVerifyPrompt(
  input: OverwatchVerifyInput,
  contextData?: PromptContextData
): string {
  let p = `## TASK: RELEASE READINESS VERIFICATION\n\n`;
  p += `### User Goal:\n${input.user_goal}\n\n`;

  if (contextData?.notes) {
    p += `### Project Memory (NOTES.md):\n${contextData.notes}\n\n`;
  }

  if (contextData?.catchUpSummary) {
    p += `### Mid-Session Catch-Up (Prior Context & Commits):\n${contextData.catchUpSummary}\n\n`;
  }

  if (contextData?.gitStatus) {
    p += `### Git Status:\n${contextData.gitStatus}\n\n`;
  }

  if (contextData?.gitDiff) {
    p += `### Total Git Diff Against Base (${input.base_ref || 'base'}):\n${contextData.gitDiff}\n\n`;
  }

  if (contextData?.repoTree) {
    p += `### Repository File Tree:\n\`\`\`\n${contextData.repoTree}\n\`\`\`\n\n`;
  }

  if (contextData?.relevantFilesContent) {
    p += `### Full File Context (Existing Relevant, Untracked & Imported Dependencies):\n${contextData.relevantFilesContent}\n\n`;
  }

  if (input.test_results) {
    p += `### Test Suite Results:\n${input.test_results}\n\n`;
  }

  p += `Is this solution 100% verified and ready to be declared complete to the user? Only output APPROVED if the diff and test evidence conclusively prove all requirements are satisfied with no introduced bugs. Return the required JSON format.`;
  return p;
}
