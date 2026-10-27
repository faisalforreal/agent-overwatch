/**
 * Single source of truth for all naming and configuration directory constants.
 * Rename here to update across the entire codebase.
 */

export const APP_NAME = 'agent-overwatch';
export const BIN_NAME = 'agent-overwatch';
export const CONFIG_DIR_NAME = `.${APP_NAME}`;
export const CONFIG_FILE = 'config.json';
export const TARGET_NOTES_DIR = `.${APP_NAME}`;
export const NOTES_FILE = 'NOTES.md';
export const USAGE_FILE = 'usage.json';
export const LOG_PREFIX = `[${APP_NAME}]`;

export const TOOL_PLAN_CHECK = `${APP_NAME}_plan_check`;
export const TOOL_CHECKPOINT = `${APP_NAME}_checkpoint`;
export const TOOL_REVIEW = `${APP_NAME}_review`;
export const TOOL_QUICK_HINT = `${APP_NAME}_quick_hint`;
export const TOOL_VERIFY = `${APP_NAME}_verify`;
export const TOOL_STATUS = `${APP_NAME}_status`;

export const DEFAULT_SESSION_CALL_CAP = 15;
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
export const DEFAULT_TIMEOUT_MS = 180000; // 180s default timeout for reasoning models
export const DEFAULT_TOOL_TIMEOUTS: Record<string, number> = {
  [TOOL_PLAN_CHECK]: 180000, // 180s for deep architectural planning
  [TOOL_VERIFY]: 180000,     // 180s for full diff & test verification
  [TOOL_REVIEW]: 120000,     // 120s for code diff audit
  [TOOL_CHECKPOINT]: 90000,  // 90s for milestone steering
  [TOOL_QUICK_HINT]: 45000,  // 45s for quick diagnosis
};
export const DEFAULT_MAX_NOTES_BYTES = 10 * 1024; // 10 KB cap for notes to prevent token bloat
export const DEFAULT_MAX_DIFF_BYTES = 100 * 1024; // 100 KB cap for diff
export const DEFAULT_MAX_FILE_BYTES = 60 * 1024; // 60 KB per file cap
export const DEFAULT_THINKING_BUDGET = 2048;     // Default tokens for extended thinking

