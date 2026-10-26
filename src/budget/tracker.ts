import fs from 'node:fs';
import path from 'node:path';
import { TARGET_NOTES_DIR, USAGE_FILE, DEFAULT_SESSION_CALL_CAP } from '../constants.js';
import { UsageStats } from '../types.js';

export interface UsageRecord {
  timestamp: string;
  tool: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface StoredUsage {
  totalCalls: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalSpendUsd: number;
  history: UsageRecord[];
}

let inMemorySessionCalls = 0;

export function resetSessionCallCount(): void {
  inMemorySessionCalls = 0;
}

export function getSessionCallCount(): number {
  return inMemorySessionCalls;
}

export function getUsageFilePath(repoPath: string): string {
  return path.join(repoPath, TARGET_NOTES_DIR, USAGE_FILE);
}

export function loadStoredUsage(repoPath: string): StoredUsage {
  const filePath = getUsageFilePath(repoPath);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`[overwatch] Failed to read usage data at ${filePath}:`, err);
  }
  return {
    totalCalls: 0,
    totalTokens: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalSpendUsd: 0,
    history: [],
  };
}

export function saveStoredUsage(repoPath: string, data: StoredUsage): void {
  const dirPath = path.join(repoPath, TARGET_NOTES_DIR);
  const filePath = getUsageFilePath(repoPath);
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[overwatch] Failed to write usage data to ${filePath}:`, err);
  }
}

export interface BudgetCheckResult {
  allowed: boolean;
  sessionCalls: number;
  remainingCalls: number;
  maxCalls: number;
  message?: string;
}

export function checkBudget(
  maxCalls: number = DEFAULT_SESSION_CALL_CAP
): BudgetCheckResult {
  const remaining = Math.max(0, maxCalls - inMemorySessionCalls);
  if (inMemorySessionCalls >= maxCalls) {
    return {
      allowed: false,
      sessionCalls: inMemorySessionCalls,
      remainingCalls: 0,
      maxCalls,
      message: `Overwatch session call cap of ${maxCalls} calls reached. The junior agent must now proceed independently with implementation and tests.`,
    };
  }

  return {
    allowed: true,
    sessionCalls: inMemorySessionCalls,
    remainingCalls: remaining,
    maxCalls,
  };
}

export function recordCallUsage(
  repoPath: string | undefined,
  tool: string,
  model: string,
  usage?: UsageStats
): void {
  inMemorySessionCalls++;

  if (!repoPath) return;

  const current = loadStoredUsage(repoPath);
  const promptTokens = usage?.prompt_tokens || 0;
  const completionTokens = usage?.completion_tokens || 0;
  const totalTokens = usage?.total_tokens || promptTokens + completionTokens;
  const spend = usage?.estimated_cost_usd || 0;

  current.totalCalls++;
  current.totalTokens = (current.totalTokens || 0) + totalTokens;
  current.totalPromptTokens += promptTokens;
  current.totalCompletionTokens += completionTokens;
  current.totalSpendUsd += spend;

  const record: UsageRecord = {
    timestamp: new Date().toISOString(),
    tool,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: spend,
  };

  current.history.push(record);
  // Keep last 100 entries in history
  if (current.history.length > 100) {
    current.history = current.history.slice(-100);
  }

  saveStoredUsage(repoPath, current);
}
