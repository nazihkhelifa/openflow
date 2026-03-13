import type { MatchMode } from "@/types";

/**
 * Evaluates a rule against incoming text with the specified match mode.
 * Returns true if any comma-separated value matches using OR logic.
 */
export function evaluateRule(text: string | null, ruleValue: string, mode: MatchMode): boolean {
  // Guard: no match if text or ruleValue is empty
  if (!text || !ruleValue) return false;

  // Normalize text
  const normalizedText = text.toLowerCase().trim();

  // Split and normalize rule values (comma-separated)
  const values = ruleValue
    .split(',')
    .map(v => v.toLowerCase().trim())
    .filter(v => v.length > 0);

  if (values.length === 0) return false;

  // OR logic: match if ANY value matches
  return values.some(value => {
    switch (mode) {
      case "exact":
        return normalizedText === value;
      case "contains":
        return normalizedText.includes(value);
      case "starts-with":
        return normalizedText.startsWith(value);
      case "ends-with":
        return normalizedText.endsWith(value);
      default:
        return false;
    }
  });
}
