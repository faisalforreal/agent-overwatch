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

  // Current module directory
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    searchPaths.push(path.resolve(__dirname, '../models.json'));
    searchPaths.push(path.resolve(__dirname, '../../models.json'));
  } catch {
    // Ignore in non-file URL environments
  }

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
    } catch {
      // Continue to next path
    }
  }

  // Fallback defaults if models.json is not found
  const fallback: ModelsData = {
    version: '1.0.0-fallback',
    models: [
      { pattern: '.*opus.*', tier: 'frontier', reasoning: true, description: 'Opus series' },
      { pattern: '.*fable.*', tier: 'frontier', reasoning: true, description: 'Fable series' },
      { pattern: '.*argon.*', tier: 'frontier', reasoning: true, description: 'Gemini Argon series' },
      { pattern: '.*o1.*', tier: 'frontier', reasoning: true, description: 'o1 series' },
      { pattern: '.*o3.*', tier: 'frontier', reasoning: true, description: 'o3 series' },
      { pattern: '.*sonnet.*', tier: 'strong', reasoning: false, description: 'Sonnet series' },
      { pattern: '.*gpt-4o$', tier: 'strong', reasoning: false, description: 'GPT-4o' },
      { pattern: '.*flash.*', tier: 'medium', reasoning: false, description: 'Flash series' },
      { pattern: '.*haiku.*', tier: 'medium', reasoning: false, description: 'Haiku series' },
      { pattern: '.*mini.*', tier: 'medium', reasoning: false, description: 'Mini series' },
    ],
  };
  return fallback;
}

export interface ModelMatchResult {
  tier: ModelTier;
  reasoning: boolean;
  matchedPattern?: string;
  isUnknown: boolean;
}

export function getModelTier(modelName: string, customPath?: string): ModelMatchResult {
  if (!modelName || typeof modelName !== 'string') {
    return { tier: 'medium', reasoning: false, isUnknown: true };
  }

  const cleanName = modelName.trim().toLowerCase();
  const data = loadModelsData(customPath);

  for (const entry of data.models) {
    try {
      const reg = new RegExp(entry.pattern, 'i');
      if (reg.test(cleanName)) {
        return {
          tier: entry.tier,
          reasoning: entry.reasoning,
          matchedPattern: entry.pattern,
          isUnknown: false,
        };
      }
    } catch {
      // Invalid regex, skip
    }
  }

  return {
    tier: 'medium',
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
  mentorIsUnknown: boolean;
  juniorIsUnknown: boolean;
  warning?: string;
}

export function validateMentorSuperiority(
  mentorModel: string,
  juniorModel: string,
  customModelsPath?: string
): TierValidationResult {
  const mentorMatch = getModelTier(mentorModel, customModelsPath);
  const juniorMatch = getModelTier(juniorModel, customModelsPath);

  const diff = compareTiers(mentorMatch.tier, juniorMatch.tier);
  const valid = diff > 0;

  let warning: string | undefined;
  if (!valid) {
    warning = `Mentor model '${mentorModel}' (tier: ${mentorMatch.tier}) is NOT strictly stronger than junior model '${juniorModel}' (tier: ${juniorMatch.tier}). A mentor must have higher capability to guide effectively.`;
  } else if (mentorMatch.isUnknown || juniorMatch.isUnknown) {
    warning = `Heuristic tier warning: Model '${mentorMatch.isUnknown ? mentorModel : juniorModel}' was not found in models.json; defaulted to 'medium'. Verify capability.`;
  }

  return {
    valid,
    mentorTier: mentorMatch.tier,
    juniorTier: juniorMatch.tier,
    mentorIsUnknown: mentorMatch.isUnknown,
    juniorIsUnknown: juniorMatch.isUnknown,
    warning,
  };
}
