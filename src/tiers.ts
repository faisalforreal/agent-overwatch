import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModelTier, ModelsData, ModelEntry } from './types.js';

const TIER_RANKS: Record<ModelTier, number> = {
  small: 1,
  medium: 2,
  strong: 3,
  frontier: 4,
};

let cachedModelsData: ModelsData | null = null;

export function loadModelsData(customPath?: string): ModelsData {
  if (cachedModelsData && !customPath) {
    return cachedModelsData;
  }

  const searchPaths: string[] = [];
  if (customPath) {
    searchPaths.push(customPath);
  }

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    searchPaths.push(path.resolve(__dirname, '../models.json'));
    searchPaths.push(path.resolve(__dirname, '../../models.json'));
  } catch {}

  searchPaths.push(path.resolve(process.cwd(), 'models.json'));

  for (const p of searchPaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw) as ModelsData;
        if (parsed && Array.isArray(parsed.models)) {
          if (!customPath) {
            cachedModelsData = parsed;
          }
          return parsed;
        }
      }
    } catch {}
  }

  // Fallback defaults if models.json is not found
  const fallback: ModelsData = {
    version: '1.1.0-fallback',
    models: [
      { pattern: '.*fable.*', tier: 'frontier', rank: 98, reasoning: true, description: 'Fable series' },
      { pattern: '.*opus.*', tier: 'frontier', rank: 96, reasoning: true, description: 'Opus series' },
      { pattern: '.*argon.*', tier: 'frontier', rank: 95, reasoning: true, description: 'Gemini Argon series' },
      { pattern: '.*o3.*', tier: 'frontier', rank: 94, reasoning: true, description: 'o3 series' },
      { pattern: '.*o1.*', tier: 'frontier', rank: 91, reasoning: true, description: 'o1 series' },
      { pattern: '.*sonnet.*', tier: 'strong', rank: 78, reasoning: false, description: 'Sonnet series' },
      { pattern: '.*gpt-4o$', tier: 'strong', rank: 76, reasoning: false, description: 'GPT-4o' },
      { pattern: '.*flash.*', tier: 'medium', rank: 55, reasoning: false, description: 'Flash series' },
      { pattern: '.*haiku.*', tier: 'medium', rank: 50, reasoning: false, description: 'Haiku series' },
      { pattern: '.*mini.*', tier: 'medium', rank: 48, reasoning: false, description: 'Mini series' },
    ],
  };
  return fallback;
}

export interface ModelMatchResult {
  tier: ModelTier;
  rank: number;
  reasoning: boolean;
  matchedPattern?: string;
  isUnknown: boolean;
}

export function getModelTier(modelName: string, customPath?: string): ModelMatchResult {
  if (!modelName || typeof modelName !== 'string') {
    return { tier: 'medium', rank: 50, reasoning: false, isUnknown: true };
  }

  const cleanName = modelName.trim().toLowerCase();
  const data = loadModelsData(customPath);

  for (const entry of data.models) {
    try {
      const reg = new RegExp(entry.pattern, 'i');
      if (reg.test(cleanName)) {
        return {
          tier: entry.tier,
          rank: entry.rank || 50,
          reasoning: entry.reasoning,
          matchedPattern: entry.pattern,
          isUnknown: false,
        };
      }
    } catch {}
  }

  return {
    tier: 'medium',
    rank: 50,
    reasoning: false,
    isUnknown: true,
  };
}

export function compareTiers(tierA: ModelTier, tierB: ModelTier): number {
  return TIER_RANKS[tierA] - TIER_RANKS[tierB];
}

export interface TierValidationResult {
  valid: boolean;
  mentorTier: ModelTier;
  juniorTier: ModelTier;
  mentorRank: number;
  juniorRank: number;
  mentorIsUnknown: boolean;
  juniorIsUnknown: boolean;
  isIntraTier: boolean;
  warning?: string;
}

export function validateMentorSuperiority(
  mentorModel: string,
  juniorModel: string,
  customModelsPath?: string
): TierValidationResult {
  const mentorMatch = getModelTier(mentorModel, customModelsPath);
  const juniorMatch = getModelTier(juniorModel, customModelsPath);

  const tierDiff = compareTiers(mentorMatch.tier, juniorMatch.tier);
  let valid = false;
  let isIntraTier = false;
  let warning: string | undefined;

  if (tierDiff > 0) {
    // Strictly higher tier (e.g. frontier vs medium, or strong vs medium)
    valid = true;
  } else if (tierDiff === 0) {
    // Same tier: evaluate intra-tier ranking (e.g., Fable 5.1 [98] vs Claude Opus [96])
    isIntraTier = true;
    const rankDiff = mentorMatch.rank - juniorMatch.rank;
    if (rankDiff > 0) {
      valid = true;
      // Valid intra-tier configuration
    } else if (rankDiff === 0) {
      valid = false;
      warning = `Both mentor '${mentorModel}' and junior '${juniorModel}' have identical capability rank (${mentorMatch.rank}) in tier '${mentorMatch.tier}'. A mentor must be strictly stronger than the junior agent.`;
    } else {
      valid = false;
      warning = `Mentor model '${mentorModel}' (rank: ${mentorMatch.rank}) is NOT stronger than junior model '${juniorModel}' (rank: ${juniorMatch.rank}) within tier '${mentorMatch.tier}'. Intra-tier mentors must have a higher rank.`;
    }
  } else {
    // Strictly lower tier
    valid = false;
    warning = `Mentor model '${mentorModel}' (tier: ${mentorMatch.tier}) has lower capability tier than junior model '${juniorModel}' (tier: ${juniorMatch.tier}). A mentor must have higher capability to guide effectively.`;
  }

  if (mentorMatch.isUnknown || juniorMatch.isUnknown) {
    const unknownNote = `Heuristic tier warning: Model '${mentorMatch.isUnknown ? mentorModel : juniorModel}' was not found in models.json; defaulted to 'medium' (rank 50). Verify capability.`;
    warning = warning ? `${warning} (${unknownNote})` : unknownNote;
  }

  return {
    valid,
    mentorTier: mentorMatch.tier,
    juniorTier: juniorMatch.tier,
    mentorRank: mentorMatch.rank,
    juniorRank: juniorMatch.rank,
    mentorIsUnknown: mentorMatch.isUnknown,
    juniorIsUnknown: juniorMatch.isUnknown,
    isIntraTier,
    warning,
  };
}
