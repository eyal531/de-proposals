// API prices in USD per million tokens, used only to show and log the cost of an AI run.
// Haiku 5.5 charges 5x for a request whose prompt is over 100K tokens.

interface Price {
  in: number;
  out: number;
  longOver?: number;
  longMultiplier?: number;
}

export const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5, longOver: 100_000, longMultiplier: 5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
};
export const SEARCH_PRICE = 0.01; // $10 per 1,000 web searches

export function requestCost(model: string, inputTokens: number, outputTokens: number, searches = 0) {
  const p = PRICES[model] ?? PRICES["claude-sonnet-5-5"];
  const k = p.longOver && inputTokens > p.longOver ? (p.longMultiplier ?? 1) : 1;
  return ((inputTokens * p.in + outputTokens * p.out) * k) / 1_000_000 + searches * SEARCH_PRICE;
}
