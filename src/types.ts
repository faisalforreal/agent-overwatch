import { z } from 'zod';

export const ModelTierEnum = z.enum(['small', 'medium', 'strong', 'frontier']);
export type ModelTier = z.infer<typeof ModelTierEnum>;

export const VerdictEnum = z.enum(['APPROVED', 'NEEDS_REFINEMENT', 'CRITICAL_REVISION']);
export type Verdict = z.infer<typeof VerdictEnum>;

export const DefectSeverityEnum = z.enum(['critical', 'high', 'medium', 'low']);
export type DefectSeverity = z.infer<typeof DefectSeverityEnum>;

export const DefectSchema = z.object({
  severity: DefectSeverityEnum,
  location: z.string().describe('File path, function name, or line range'),
  explanation: z.string().describe('Why this is a defect or bug'),
  suggested_fix: z.string().describe('Concrete guidance or code snippet on how to fix it'),
});
export type Defect = z.infer<typeof DefectSchema>;

export const OptimizationSchema = z.object({
  type: z.enum(['performance', 'architecture', 'memory', 'security', 'maintainability']),
  description: z.string(),
  impact: z.string().describe('Estimated speedup, memory reduction, or quality gain'),
});
export type Optimization = z.infer<typeof OptimizationSchema>;

export const UsageStatsSchema = z.object({
  prompt_tokens: z.number().default(0),
  completion_tokens: z.number().default(0),
  total_tokens: z.number().default(0),
  estimated_cost_usd: z.number().default(0),
});
export type UsageStats = z.infer<typeof UsageStatsSchema>;

export const OverwatchFeedbackSchema = z.object({
  verdict: VerdictEnum,
  summary: z.string().describe('Concise senior architect executive summary'),
  defects: z.array(DefectSchema).default([]),
  optimizations: z.array(OptimizationSchema).default([]),
  next_steps: z.array(z.string()).describe('3-5 immediate concrete steps for the junior agent'),
  avoid: z.array(z.string()).describe('Pitfalls, anti-patterns, or bad directions to avoid'),
  coaching_prompt: z.string().describe('Ready-to-execute instruction prompt for the junior agent'),
  notes_to_save: z.array(z.string()).default([]).describe('Decisions, constraints, or rejected approaches to preserve in NOTES.md'),
  usage: UsageStatsSchema.optional(),
});
export type OverwatchFeedback = z.infer<typeof OverwatchFeedbackSchema>;

// Tool Input Schemas
export const OverwatchPlanCheckInputSchema = z.object({
  user_goal: z.string().describe('The primary task or prompt from the user'),
  proposed_plan: z.string().describe('The detailed plan drafted by the junior agent'),
  repo_path: z.string().optional().describe('Absolute path to repository root for context gathering'),
  relevant_files: z.array(z.string()).optional().describe('List of relevant relative file paths suggested by junior agent'),
  architecture_context: z.string().optional().describe('Additional notes on framework, dependencies, or system constraints'),
});
export type OverwatchPlanCheckInput = z.infer<typeof OverwatchPlanCheckInputSchema>;

export const OverwatchCheckpointInputSchema = z.object({
  user_goal: z.string().describe('The primary task or prompt from the user'),
  state: z.object({
    done: z.array(z.string()).describe('Milestones or steps completed so far'),
    failing: z.string().optional().describe('Current failure or error if any (especially if 2 consecutive failures)'),
    about_to_do: z.string().describe('The next action or phase the junior agent is about to execute'),
  }),
  repo_path: z.string().optional().describe('Absolute path to repository root for automatic diff and status check'),
  error_log: z.string().optional().describe('Compiler, test, or runtime error log'),
});
export type OverwatchCheckpointInput = z.infer<typeof OverwatchCheckpointInputSchema>;

export const OverwatchReviewInputSchema = z.object({
  user_goal: z.string().describe('The primary task or prompt from the user'),
  repo_path: z.string().optional().describe('Absolute path to repository root (preferred; server reads real git diff)'),
  draft_code_or_diff: z.string().optional().describe('Manual code or diff snippet if repo_path is not available'),
  file_context: z.string().optional().describe('Additional context or file snippets'),
  current_tests_or_errors: z.string().optional().describe('Test execution outputs or errors'),
  mentor_model: z.string().optional().describe('Optional per-call override for mentor model'),
});
export type OverwatchReviewInput = z.infer<typeof OverwatchReviewInputSchema>;

export const OverwatchQuickHintInputSchema = z.object({
  problem_description: z.string().describe('Brief description of where the agent is stuck'),
  error_or_log: z.string().describe('The exact error message, stack trace, or compiler error'),
  attempted_fix: z.string().optional().describe('What the junior agent tried and why it failed'),
});
export type OverwatchQuickHintInput = z.infer<typeof OverwatchQuickHintInputSchema>;

export const OverwatchVerifyInputSchema = z.object({
  user_goal: z.string().describe('The primary task or prompt from the user'),
  repo_path: z.string().describe('Absolute path to repository root to inspect real git diff against base ref'),
  base_ref: z.string().optional().default('HEAD~1').describe('Git base reference to diff against (e.g. main, HEAD~1)'),
  test_results: z.string().optional().describe('Console output of test suite execution'),
});
export type OverwatchVerifyInput = z.infer<typeof OverwatchVerifyInputSchema>;

export const OverwatchStatusInputSchema = z.object({
  repo_path: z.string().optional().describe('Repository path to check local notes and session budget'),
});
export type OverwatchStatusInput = z.infer<typeof OverwatchStatusInputSchema>;

export interface ModelEntry {
  pattern: string;
  tier: ModelTier;
  reasoning: boolean;
  description: string;
}

export interface ModelsData {
  version: string;
  models: ModelEntry[];
}
