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

  // Fallback defaults
  const fallback: ModelsData = {
    version: '1.2.0-fallback',
    models: [
      { pattern: '.*fable.*', tier: 'frontier', ordinal: 3, reasoning: true, description: 'Fable series' },
      { pattern: '.*opus.*', tier: 'frontier', ordinal: 2, reasoning: true, description: 'Opus series' },
      { pattern: '.*o3.*', tier: 'frontier', ordinal: 2, reasoning: true, description: 'o3 series' },
      { pattern: '.*o1.*', tier: 'frontier', ordinal: 1, reasoning: true, description: 'o1 series' },
      { pattern: '.*sonnet.*', tier: 'strong', ordinal: 2, reasoning: false, description: 'Sonnet series' },
      { pattern: '.*deepseek.*', tier: 'strong', ordinal: 2, reasoning: true, description: 'DeepSeek series' },
      { pattern: '.*gpt-4o$', tier: 'strong', ordinal: 2, reasoning: false, description: 'GPT-4o' },
      { pattern: '.*flash.*', tier: 'medium', ordinal: 2, reasoning: false, description: 'Flash series' },
      { pattern: '.*haiku.*', tier: 'medium', ordinal: 2, reasoning: false, description: 'Haiku series' },
      { pattern: '.*mini.*', tier: 'medium', ordinal: 1, reasoning: false, description: 'Mini series' },
    ],
  };
  return fallback;
}

export interface ModelMatchResult {
  tier: ModelTier;
  ordinal: number;
  reasoning: boolean;
  matchedPattern?: string;
  isUnknown: boolean;
}

export function getModelTier(modelName: string, customPath?: string): ModelMatchResult {
  if (!modelName || typeof modelName !== 'string') {
    return { tier: 'medium', ordinal: 1, reasoning: false, isUnknown: true };
  }

  const cleanName = modelName.trim().toLowerCase();
  const data = loadModelsData(customPath);

  for (const entry of data.models) {
    try {
      const reg = new RegExp(entry.pattern, 'i');
      if (reg.test(cleanName)) {
        return {
          tier: entry.tier,
          ordinal: entry.ordinal || 1,
          reasoning: entry.reasoning,
          matchedPattern: entry.pattern,
          isUnknown: false,
        };
      }
    } catch {}
  }

  return {
    tier: 'medium',
    ordinal: 1,
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
  mentorOrdinal: number;
  juniorOrdinal: number;
  mentorIsUnknown: boolean;
  juniorIsUnknown: boolean;
  isIntraTier: boolean;
  warning?: string;
}

export function validateMentorSuperiority(
  mentorModel: string,
  juniorModel: string,
  options: { customModelsPath?: string; allowSameTier?: boolean } = {}
): TierValidationResult {
  const mentorMatch = getModelTier(mentorModel, options.customModelsPath);
  const juniorMatch = getModelTier(juniorModel, options.customModelsPath);

  const tierDiff = compareTiers(mentorMatch.tier, juniorMatch.tier);
  let valid = false;
  let isIntraTier = false;
  let warning: string | undefined;

  if (tierDiff > 0) {
    // Strictly higher tier (e.g. frontier > medium, strong > medium)
    valid = true;
  } else if (tierDiff === 0) {
    // Same tier
    isIntraTier = true;
    const ordinalDiff = mentorMatch.ordinal - juniorMatch.ordinal;

    if (options.allowSameTier) {
      valid = true;
      warning = `Same-tier pairing allowed by configuration (both '${mentorMatch.tier}').`;
    } else if (ordinalDiff > 0) {
      // Mentor has higher ordinal within same tier (e.g. Fable 5.1 [3] vs Opus [2])
      valid = true;
      warning = `Intra-tier mentor pairing: both models in '${mentorMatch.tier}' tier, but mentor has higher ordinal priority (${mentorMatch.ordinal} vs ${juniorMatch.ordinal}).`;
    } else {
      valid = false;
      warning = `Mentor model '${mentorModel}' is not stronger than junior model '${juniorModel}' (both in '${mentorMatch.tier}' tier with close capability). A mentor should belong to a higher capability tier.`;
    }
  } else {
    // Strictly lower tier
    valid = false;
    warning = `Mentor model '${mentorModel}' (tier: ${mentorMatch.tier}) has lower capability tier than junior model '${juniorModel}' (tier: ${juniorMatch.tier}). A mentor must have higher capability to guide effectively.`;
  }

  if (mentorMatch.isUnknown || juniorMatch.isUnknown) {
    const unknownNote = `Heuristic tier warning: Model '${mentorMatch.isUnknown ? mentorModel : juniorModel}' was not found in models.json; defaulted to 'medium'.`;
    warning = warning ? `${warning} (${unknownNote})` : unknownNote;
  }

  return {
    valid,
    mentorTier: mentorMatch.tier,
    juniorTier: juniorMatch.tier,
    mentorOrdinal: mentorMatch.ordinal,
    juniorOrdinal: juniorMatch.ordinal,
    mentorIsUnknown: mentorMatch.isUnknown,
    juniorIsUnknown: juniorMatch.isUnknown,
    isIntraTier,
    warning,
  };
}
