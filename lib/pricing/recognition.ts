/** Providers must return suggestions only. Physical inspection remains a separate staff action. */
export type RecognitionSuggestion = {
  brand: string | null;
  category: string | null;
  garmentType: string | null;
  color: string | null;
  material: string | null;
  sizeLabel: string | null;
  visibleDefects: string[];
  suggestedCondition: string | null;
  confidenceBps: number | null;
};
export type RecognitionResult = {
  suggestion: RecognitionSuggestion;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: { currency: string; micros: number } | null;
};
export interface RecognitionProvider {
  recognize(input: {
    photoUrls: string[];
    idempotencyKey: string;
    signal: AbortSignal;
  }): Promise<RecognitionResult>;
}
export function validateRecognition(value: unknown): RecognitionSuggestion {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid recognition output");
  const r = value as Record<string, unknown>;
  const field = (key: string) => {
    const v = r[key];
    if (v === null) return null;
    if (typeof v !== "string" || v.length > 200)
      throw new Error(`Invalid recognition field: ${key}`);
    return v.trim() || null;
  };
  if (
    !Array.isArray(r.visibleDefects) ||
    r.visibleDefects.length > 20 ||
    r.visibleDefects.some((v) => typeof v !== "string" || v.length > 300)
  )
    throw new Error("Invalid visible defects");
  if (
    r.confidenceBps !== null &&
    (!Number.isInteger(r.confidenceBps) ||
      Number(r.confidenceBps) < 0 ||
      Number(r.confidenceBps) > 10000)
  )
    throw new Error("Invalid confidence");
  return {
    brand: field("brand"),
    category: field("category"),
    garmentType: field("garmentType"),
    color: field("color"),
    material: field("material"),
    sizeLabel: field("sizeLabel"),
    suggestedCondition: field("suggestedCondition"),
    visibleDefects: r.visibleDefects as string[],
    confidenceBps: r.confidenceBps as number | null,
  };
}
