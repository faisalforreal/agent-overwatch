import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModelTier, ModelsData, ModelEntry, ModelDefaults } from './types.js';

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
    version: '1.3.0-fallback',
    defaults: {
      junior: 'gemini-2.0-flash',
      mentor: 'claude-3-opus-20240229',
      providerDefaults: {
        anthropic: 'claude-3-opus-20240229',
        gemini: 'gemini-2.0-pro-exp-02-05',
        openai: 'o3-mini',
        openrouter: 'anthropic/claude-3-7-sonnet',
      },
    },
    models: [
      { pattern: '.*fable.*', tier: 'frontier', ordinal: 3, reasoning: true, description: 'Fable series', inputCostPerMillion: 15.0, outputCostPerMillion: 75.0 },
      { pattern: '.*opus.*', tier: 'frontier', ordinal: 2, reasoning: true, description: 'Opus series', inputCostPerMillion: 15.0, outputCostPerMillion: 75.0 },
      { pattern: '^(openai/)?o3(-mini)?$', tier: 'frontier', ordinal: 2, reasoning: true, description: 'o3 series', inputCostPerMillion: 1.1, outputCostPerMillion: 4.4 },
      { pattern: '^(openai/)?o1(-preview|-mini)?$', tier: 'frontier', ordinal: 1, reasoning: true, description: 'o1 series', inputCostPerMillion: 15.0, outputCostPerMillion: 60.0 },
      { pattern: '.*sonnet.*', tier: 'strong', ordinal: 2, reasoning: false, description: 'Sonnet series', inputCostPerMillion: 3.0, outputCostPerMillion: 15.0 },
      { pattern: '.*deepseek.*', tier: 'strong', ordinal: 2, reasoning: true, description: 'DeepSeek series', inputCostPerMillion: 0.55, outputCostPerMillion: 2.19 },
      { pattern: '.*gpt-4o$', tier: 'strong', ordinal: 2, reasoning: false, description: 'GPT-4o', inputCostPerMillion: 2.5, outputCostPerMillion: 10.0 },
      { pattern: '.*flash.*', tier: 'medium', ordinal: 2, reasoning: false, description: 'Flash series', inputCostPerMillion: 0.1, outputCostPerMillion: 0.4 },
      { pattern: '.*haiku.*', tier: 'medium', ordinal: 2, reasoning: false, description: 'Haiku series', inputCostPerMillion: 0.8, outputCostPerMillion: 4.0 },
      { pattern: '.*mini.*', tier: 'medium', ordinal: 1, reasoning: false, description: 'Mini series', inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 },
    ],
  };
  return fallback;
}

export function getModelDefaults(customPath?: string): ModelDefaults {
  const data = loadModelsData(customPath);
  return (
    data.defaults || {
      junior: 'gemini-2.0-flash',
      mentor: 'claude-3-opus-20240229',
      providerDefaults: {
        anthropic: 'claude-3-opus-20240229',
        gemini: 'gemini-2.0-pro-exp-02-05',
        openai: 'o3-mini',
        openrouter: 'anthropic/claude-3-7-sonnet',
      },
    }
  );
}

export function estimateModelCost(
  modelName: string,
  promptTokens: number,
  completionTokens: number,
  customPath?: string,
  additionalModels?: ModelEntry[]
): number {
  if (!modelName) return 0;
  const cleanName = modelName.trim().toLowerCase();
  const data = loadModelsData(customPath);
  const models = [...(additionalModels || []), ...data.models];

  let inputCost = 3.0; // default fallback ($/M)
  let outputCost = 15.0;

  for (const entry of models) {
    try {
      const reg = new RegExp(entry.pattern, 'i');
      if (reg.test(cleanName)) {
        if (entry.inputCostPerMillion !== undefined && entry.outputCostPerMillion !== undefined) {
          inputCost = entry.inputCostPerMillion;
          outputCost = entry.outputCostPerMillion;
          break;
        }
        switch (entry.tier) {
          case 'frontier':
            inputCost = 15.0;
            outputCost = 75.0;
            break;
          case 'strong':
            inputCost = 3.0;
            outputCost = 15.0;
            break;
          case 'medium':
            inputCost = 0.5;
            outputCost = 1.5;
            break;
          case 'small':
            inputCost = 0.1;
            outputCost = 0.4;
            break;
        }
        break;
      }
    } catch {}
  }

  return (promptTokens / 1_000_000) * inputCost + (completionTokens / 1_000_000) * outputCost;
}

export interface ModelMatchResult {
  tier: ModelTier;
  ordinal: number;
  reasoning: boolean;
  matchedPattern?: string;
  isUnknown: boolean;
}

export function getModelTier(
  modelName: string,
  customPath?: string,
  additionalModels?: ModelEntry[]
): ModelMatchResult {
  if (!modelName || typeof modelName !== 'string') {
    return { tier: 'medium', ordinal: 1, reasoning: false, isUnknown: true };
  }

  const cleanName = modelName.trim().toLowerCase();
  const data = loadModelsData(customPath);
  const models = [...(additionalModels || []), ...data.models];

  for (const entry of models) {
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
  juniorTier: ModelTier | 'auto';
  mentorOrdinal: number;
  juniorOrdinal: number;
  mentorIsUnknown: boolean;
  juniorIsUnknown: boolean;
  isIntraTier: boolean;
  warning?: string;
}

export function validateMentorSuperiority(
  mentorModel: string,
  juniorModel?: string,
  options: {
    customModelsPath?: string;
    allowSameTier?: boolean;
    customModels?: ModelEntry[];
  } = {}
): TierValidationResult {
  const mentorMatch = getModelTier(mentorModel, options.customModelsPath, options.customModels);

  if (!juniorModel || juniorModel === 'auto' || juniorModel === 'unknown') {
    return {
      valid: true,
      mentorTier: mentorMatch.tier,
      juniorTier: 'auto',
      mentorOrdinal: mentorMatch.ordinal,
      juniorOrdinal: 0,
      mentorIsUnknown: mentorMatch.isUnknown,
      juniorIsUnknown: false,
      isIntraTier: false,
    };
  }
  const juniorMatch = getModelTier(juniorModel, options.customModelsPath, options.customModels);

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
