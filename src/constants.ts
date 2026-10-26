/**
 * Single source of truth for all naming and configuration directory constants.
 * Rename here to update across the entire codebase.
 */

export const APP_NAME = 'overwatch';
export const BIN_NAME = 'overwatch';
export const CONFIG_DIR_NAME = `.${APP_NAME}`;
export const CONFIG_FILE = 'config.json';
export const TARGET_NOTES_DIR = `.${APP_NAME}`;
export const NOTES_FILE = 'NOTES.md';
export const USAGE_FILE = 'usage.json';
export const DEFAULT_SESSION_CALL_CAP = 15;
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
export const DEFAULT_TIMEOUT_MS = 90000; // 90 seconds
export const DEFAULT_MAX_NOTES_BYTES = 10 * 1024; // 10 KB cap for notes to prevent token bloat
export const DEFAULT_MAX_DIFF_BYTES = 100 * 1024; // 100 KB cap for diff
export const DEFAULT_MAX_FILE_BYTES = 60 * 1024; // 60 KB per file cap
