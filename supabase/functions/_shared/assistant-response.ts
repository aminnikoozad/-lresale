/** Local models may wrap final JSON in a Markdown fence. Never evaluate code
 * or guess an operation from surrounding prose or malformed model output. */
export function parseAssistantResponse(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") throw new Error("Missing model reply");
  const text = value.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1").trim();
  const result: unknown = JSON.parse(text);
  if (!result || typeof result !== "object" || Array.isArray(result) ||
      typeof (result as Record<string, unknown>).reply !== "string" ||
      !(result as Record<string, string>).reply.trim())
    throw new Error("Invalid model reply");
  return result as Record<string, unknown>;
}
