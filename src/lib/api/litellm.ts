interface LiteLLMPricing {
  perImage?: number;
  perSecond?: number;
  perCharacter?: number;
}

type LiteLLMEntry = Record<string, unknown>;

export async function fetchLiteLLMPricing(): Promise<Map<string, LiteLLMPricing>> {
  const map = new Map<string, LiteLLMPricing>();

  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
    );
    if (!response.ok) {
      console.warn(`LiteLLM pricing fetch failed: ${response.status}`);
      return map;
    }

    const data = (await response.json()) as Record<string, LiteLLMEntry>;

    for (const [key, entry] of Object.entries(data)) {
      const pricing: LiteLLMPricing = {};

      if (typeof entry.output_cost_per_image === 'number') {
        pricing.perImage = entry.output_cost_per_image;
      }

      const perSecond =
        typeof entry.output_cost_per_second === 'number'
          ? entry.output_cost_per_second
          : typeof entry.input_cost_per_second === 'number'
            ? entry.input_cost_per_second
          : typeof entry.input_cost_per_video_per_second === 'number'
            ? entry.input_cost_per_video_per_second
            : typeof entry.output_cost_per_video_per_second === 'number'
              ? entry.output_cost_per_video_per_second
            : undefined;

      if (perSecond !== undefined) {
        pricing.perSecond = perSecond;
      }

      if (typeof entry.input_cost_per_character === 'number') {
        pricing.perCharacter = entry.input_cost_per_character;
      }

      if (
        pricing.perImage !== undefined ||
        pricing.perSecond !== undefined ||
        pricing.perCharacter !== undefined
      ) {
        map.set(key, pricing);

        // Also store under stripped key: "fal_ai/fal-ai/xxx" → "fal-ai/xxx"
        if (key.startsWith('fal_ai/')) {
          const stripped = key.slice('fal_ai/'.length);
          if (!map.has(stripped)) {
            map.set(stripped, pricing);
          }
        }
      }
    }

    console.log(`Fetched ${map.size} models from LiteLLM pricing data`);
  } catch (error) {
    console.warn('Failed to fetch LiteLLM pricing data:', error);
  }

  return map;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function comparableKeys(value: string): string[] {
  const parts = value.toLowerCase().split('/').filter(Boolean);
  const candidates = new Set<string>([
    value,
    parts.slice(-1).join('/'),
    parts.slice(-2).join('/'),
    parts.slice(-3).join('/'),
  ]);

  if (parts[0] === 'fal-ai' || parts[0] === 'fal_ai') {
    candidates.add(parts.slice(1).join('/'));
  }

  return Array.from(candidates).map(normalize).filter(key => key.length > 4);
}

export function findLiteLLMPrice(
  falModelId: string,
  pricingMap: Map<string, LiteLLMPricing>,
  modelTitle?: string
): LiteLLMPricing | null {
  // Direct match by FAL.ai ID
  const direct = pricingMap.get(`fal_ai/${falModelId}`);
  if (direct) return direct;

  const directStripped = pricingMap.get(falModelId);
  if (directStripped) return directStripped;

  // Fuzzy match by FAL.ai ID
  const targetKeys = comparableKeys(falModelId);
  for (const [key, pricing] of pricingMap.entries()) {
    const sourceKeys = comparableKeys(key);
    for (const targetKey of targetKeys) {
      if (
        sourceKeys.some(
          sourceKey => sourceKey.includes(targetKey) || targetKey.includes(sourceKey)
        )
      ) {
        return pricing;
      }
    }
  }

  // Fuzzy match by model title (e.g. "FLUX.1 [schnell]" -> "flux/schnell")
  if (modelTitle) {
    const normalizedTitle = normalize(modelTitle.replace(/[[\].]/g, ''));
    for (const [key, pricing] of pricingMap.entries()) {
      for (const normalizedKey of comparableKeys(key)) {
        if (
          normalizedTitle.length > 4 &&
          normalizedKey.length > 4 &&
          (normalizedKey.includes(normalizedTitle) || normalizedTitle.includes(normalizedKey))
        ) {
          return pricing;
        }
      }
    }
  }

  return null;
}
