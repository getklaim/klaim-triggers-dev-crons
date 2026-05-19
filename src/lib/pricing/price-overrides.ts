import type { ParsedPrice, PriceType } from "./price-resolver.js";

interface PriceOverride {
  match: string;
  type: PriceType;
  pricing: ParsedPrice;
  sourceUrl: string;
}

const PRICE_OVERRIDES: PriceOverride[] = [
  {
    match: "elevenlabs/tts/turbo-v2.5",
    type: "audio",
    pricing: { perCharacter: 0.00018 },
    sourceUrl: "https://elevenlabs.io/pricing",
  },
  {
    match: "elevenlabs/speech-to-text/scribe-v2",
    type: "audio",
    pricing: { perSecond: 0.0000611 },
    sourceUrl: "https://elevenlabs.io/pricing",
  },
  {
    match: "elevenlabs/speech-to-text",
    type: "audio",
    pricing: { perSecond: 0.0000611 },
    sourceUrl: "https://elevenlabs.io/pricing",
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findPriceOverride(
  modelId: string,
  title: string,
  type: PriceType
): PriceOverride | null {
  const normalizedId = normalize(modelId);
  const normalizedTitle = normalize(title);

  return (
    PRICE_OVERRIDES.find(
      override =>
        override.type === type &&
        (normalizedId.includes(normalize(override.match)) ||
          normalizedTitle.includes(normalize(override.match)))
    ) ?? null
  );
}
