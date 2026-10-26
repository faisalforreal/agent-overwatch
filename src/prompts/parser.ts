import { OverwatchFeedback, OverwatchFeedbackSchema, Verdict } from '../types.js';
import { APP_NAME } from '../constants.js';

export function cleanJsonFences(text: string): string {
  let cleaned = text.trim();
  // Strip opening markdown code fence
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
  // Strip trailing markdown code fence
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  return cleaned.trim();
}

/**
 * Attempts to repair mild JSON malformations (e.g., trailing commas, unescaped newlines in strings)
 */
export function basicJsonRepair(raw: string): string {
  let s = cleanJsonFences(raw);
  // Remove trailing commas before closing braces/brackets
  s = s.replace(/,(\s*[}\]])/g, '$1');
  return s;
}

/**
 * Fallback parser when LLM returns pure Markdown instead of JSON.
 * Synthesizes a valid OverwatchFeedback object.
 */
export function fallbackMarkdownToFeedback(text: string): OverwatchFeedback {
  const upper = text.toUpperCase();
  let verdict: Verdict = 'NEEDS_REFINEMENT';
  if (upper.includes('VERDICT: APPROVED') || upper.includes('"VERDICT": "APPROVED"')) {
    verdict = 'APPROVED';
  } else if (upper.includes('VERDICT: CRITICAL_REVISION') || upper.includes('CRITICAL_REVISION')) {
    verdict = 'CRITICAL_REVISION';
  }

  // Extract lines for next steps
  const nextSteps: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed)) {
      if (nextSteps.length < 5) {
        nextSteps.push(trimmed.replace(/^[-*\d.]+\s*/, ''));
      }
    }
  }

  if (nextSteps.length === 0) {
    nextSteps.push('Review the senior architect feedback and proceed with the specified adjustments.');
  }

  return {
    verdict,
    summary: text.slice(0, 300).trim() + (text.length > 300 ? '...' : ''),
    defects: [],
    optimizations: [],
    next_steps: nextSteps,
    avoid: ['Proceeding without addressing the senior architect feedback'],
    coaching_prompt: 'Address the senior architect points above and verify with tests.',
    notes_to_save: [],
  };
}

/**
 * Robust JSON extraction & validation.
 * 1. Clean code fences
 * 2. Parse JSON & Validate with Zod
 * 3. Try basic repair
 * 4. Fall back to Markdown extraction
 */
export function parseOverwatchFeedback(rawText: string): OverwatchFeedback {
  if (!rawText || !rawText.trim()) {
    return fallbackMarkdownToFeedback('Empty response received from mentor model.');
  }

  // Try direct parse
  const cleaned = cleanJsonFences(rawText);
  try {
    const obj = JSON.parse(cleaned);
    const parsed = OverwatchFeedbackSchema.safeParse(obj);
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // Continue to repair
  }

  // Try basic repair
  try {
    const repaired = basicJsonRepair(rawText);
    const obj = JSON.parse(repaired);
    const parsed = OverwatchFeedbackSchema.safeParse(obj);
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // Fallback to Markdown extraction
  }

  return fallbackMarkdownToFeedback(rawText);
}

/**
 * Format OverwatchFeedback into clean, human-readable Markdown for user & agent inspection
 */
export function formatFeedbackAsMarkdown(fb: OverwatchFeedback): string {
  const verdictEmoji =
    fb.verdict === 'APPROVED' ? '✅' : fb.verdict === 'NEEDS_REFINEMENT' ? '⚠️' : '🚨';

  const titleName = APP_NAME.charAt(0).toUpperCase() + APP_NAME.slice(1);
  let md = `### ${titleName} Verdict: ${verdictEmoji} **${fb.verdict}**\n\n`;
  md += `> ${fb.summary}\n\n`;

  if (fb.defects && fb.defects.length > 0) {
    md += `#### 🔍 Identified Defects (${fb.defects.length})\n`;
    for (const d of fb.defects) {
      md += `- **[${d.severity.toUpperCase()}]** \`${d.location}\`: ${d.explanation}\n`;
      md += `  *Fix:* ${d.suggested_fix}\n`;
    }
    md += `\n`;
  }

  if (fb.optimizations && fb.optimizations.length > 0) {
    md += `#### ⚡ Optimizations (${fb.optimizations.length})\n`;
    for (const opt of fb.optimizations) {
      md += `- **[${opt.type}]** ${opt.description} *(Impact: ${opt.impact})*\n`;
    }
    md += `\n`;
  }

  if (fb.next_steps && fb.next_steps.length > 0) {
    md += `#### 📋 Next Steps for Junior Agent\n`;
    fb.next_steps.forEach((step, idx) => {
      md += `${idx + 1}. ${step}\n`;
    });
    md += `\n`;
  }

  if (fb.avoid && fb.avoid.length > 0) {
    md += `#### ⛔ Avoid / Anti-Patterns\n`;
    for (const a of fb.avoid) {
      md += `- ❌ ${a}\n`;
    }
    md += `\n`;
  }

  if (fb.coaching_prompt) {
    md += `#### 🎯 Junior Agent Coaching Prompt\n`;
    md += `\`\`\`text\n${fb.coaching_prompt}\n\`\`\`\n\n`;
  }

  if (fb.notes_to_save && fb.notes_to_save.length > 0) {
    md += `#### 💾 Decisions Saved to Notes\n`;
    for (const note of fb.notes_to_save) {
      md += `- ${note}\n`;
    }
    md += `\n`;
  }

  if (fb.usage) {
    md += `*Tokens: ${fb.usage.total_tokens} (est. \$${fb.usage.estimated_cost_usd.toFixed(4)})*\n`;
  }

  return md;
}
