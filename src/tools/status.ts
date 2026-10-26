import fs from 'node:fs';
import { OverwatchConfig } from '../config.js';
import { ProviderRouter } from '../providers/router.js';
import { validateMentorSuperiority } from '../tiers.js';
import {
  getSessionCallCount,
  loadStoredUsage,
} from '../budget/tracker.js';
import { getRepoNotesPath } from '../context/notes.js';

export interface OverwatchStatusResult {
  juniorModel: string;
  mentorModel: string;
  tierValidation: {
    valid: boolean;
    mentorTier: string;
    juniorTier: string;
    warning?: string;
  };
  providerHealth: {
    ok: boolean;
    provider: string;
    model: string;
    latencyMs?: number;
    error?: string;
  };
  sessionCalls: number;
  remainingSessionCalls: number;
  maxSessionCalls: number;
  lifetimeUsage?: {
    totalCalls: number;
    totalTokens: number;
    totalSpendUsd: number;
  };
  notesMemory?: {
    exists: boolean;
    sizeBytes: number;
  };
}

export async function executeStatus(
  config: OverwatchConfig,
  router: ProviderRouter,
  repoPath?: string
): Promise<{ status: OverwatchStatusResult; markdown: string }> {
  const tierRes = validateMentorSuperiority(config.mentorModel, config.juniorModel);
  const health = await router.healthCheck();

  const sessionCalls = getSessionCallCount();
  const remaining = Math.max(0, config.maxCallsPerSession - sessionCalls);

  let lifetimeUsage: OverwatchStatusResult['lifetimeUsage'];
  let notesMemory: OverwatchStatusResult['notesMemory'];

  if (repoPath) {
    const stored = loadStoredUsage(repoPath);
    lifetimeUsage = {
      totalCalls: stored.totalCalls,
      totalTokens: stored.totalTokens,
      totalSpendUsd: stored.totalSpendUsd,
    };

    const notesPath = getRepoNotesPath(repoPath);
    if (fs.existsSync(notesPath)) {
      notesMemory = {
        exists: true,
        sizeBytes: fs.statSync(notesPath).size,
      };
    } else {
      notesMemory = { exists: false, sizeBytes: 0 };
    }
  }

  const result: OverwatchStatusResult = {
    juniorModel: config.juniorModel,
    mentorModel: config.mentorModel,
    tierValidation: {
      valid: tierRes.valid,
      mentorTier: tierRes.mentorTier,
      juniorTier: tierRes.juniorTier,
      warning: tierRes.warning,
    },
    providerHealth: health,
    sessionCalls,
    remainingSessionCalls: remaining,
    maxSessionCalls: config.maxCallsPerSession,
    lifetimeUsage,
    notesMemory,
  };

  let md = `### 🛰️ Overwatch System Status\n\n`;
  md += `- **Junior Model:** \`${config.juniorModel}\` (Tier: **${tierRes.juniorTier}**)\n`;
  md += `- **Mentor Model:** \`${config.mentorModel}\` (Tier: **${tierRes.mentorTier}**)\n`;
  md += `- **Tier Hierarchy:** ${tierRes.valid ? '✅ Superiority Validated' : '⚠️ WARNING: ' + tierRes.warning}\n`;
  md += `- **Provider Connectivity:** ${health.ok ? `🟢 Connected (${health.provider}, ${health.latencyMs}ms)` : `🔴 Failed (${health.error})`}\n`;
  md += `- **Session Call Budget:** ${sessionCalls} / ${config.maxCallsPerSession} used (${remaining} remaining)\n`;

  if (lifetimeUsage) {
    md += `- **Lifetime Spend:** \$${lifetimeUsage.totalSpendUsd.toFixed(4)} across ${lifetimeUsage.totalCalls} calls (${lifetimeUsage.totalTokens} tokens)\n`;
  }
  if (notesMemory) {
    md += `- **Project Memory (NOTES.md):** ${notesMemory.exists ? `Active (${notesMemory.sizeBytes} bytes)` : 'Not yet created'}\n`;
  }

  return {
    status: result,
    markdown: md,
  };
}
