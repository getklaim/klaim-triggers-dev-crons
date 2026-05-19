import { findLiteLLMPrice, type LiteLLMPricing } from "../api/litellm.js";
import { findPriceOverride } from "./price-overrides.js";

export type PriceType = "image" | "video" | "audio";
export type PriceSource = "fal-api" | "fal-page" | "litellm" | "override" | "none";

export interface ParsedPrice {
  perImage?: number;
  perMegapixel?: number;
  perSecond?: number;
  perVideo?: number;
  perCharacter?: number;
  perOutput?: number;
}

export interface ResolvedPrice {
  pricing: ParsedPrice;
  source: PriceSource;
}

interface ResolvePriceInput {
  id: string;
  title: string;
  type: PriceType;
  pricingInfoOverride?: string;
  litellmMap: Map<string, LiteLLMPricing>;
}

function hasPrice(pricing: ParsedPrice): boolean {
  return Object.values(pricing).some(value => value !== undefined && value !== null);
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const price = parseFloat(value);
  return price > 0 ? price : undefined;
}

export function parsePriceText(
  pricingText: string | undefined,
  type: PriceType
): ParsedPrice {
  if (!pricingText) return {};

  const boldPricePattern = /\*\*\$([0-9]+\.?[0-9]*)\*\*/g;
  const matches = [...pricingText.matchAll(boldPricePattern)];

  if (type === "image") {
    if (pricingText.includes("per 1M") && pricingText.includes("Image tokens")) {
      return { perImage: 0.07 };
    }

    const perImageBold = pricingText.match(/\*\*\$([0-9]+\.?[0-9]*)\*\*[^.]*per image/i);
    const perImagePlain = pricingText.match(/\$([0-9]+\.?[0-9]*)\s+per\s+image/i);
    const reverseDollar = pricingText.match(/\*\*([0-9]+\.?[0-9]*)\$\*\*/);
    const perOutputImage = pricingText.match(/\$([0-9]+\.?[0-9]*)\s+for\s+1024x1024/i);
    const price =
      parseNumber(perImageBold?.[1]) ??
      parseNumber(perImagePlain?.[1]) ??
      parseNumber(reverseDollar?.[1]) ??
      parseNumber(perOutputImage?.[1]);

    if (price !== undefined) return { perImage: price };

    const perMegapixel = pricingText.match(/\$?([0-9]+\.?[0-9]*)\s+per\s+megapixel/i);
    const megapixelPrice = parseNumber(perMegapixel?.[1]);
    if (megapixelPrice !== undefined) return { perMegapixel: megapixelPrice };

    if (matches.length > 0 && !pricingText.includes("per 1M") && !pricingText.includes("tokens")) {
      const fallback = parseNumber(matches[0][1]);
      if (fallback !== undefined && fallback < 1) return { perImage: fallback };
    }
    return {};
  }

  if (type === "video") {
    const slashSecond = pricingText.match(/\$([0-9]+\.?[0-9]*)\s*\/\s*s(?:ec(?:ond)?)?/i);
    const chargedPlain = pricingText.match(/charged\s+\$([0-9]+\.?[0-9]*)/i);
    const secondContextPrice = pricingText.match(/second[^$]*\$([0-9]+\.?[0-9]*)/i);
    const perSecondBold = pricingText.match(/\*\*\$([0-9]+\.?[0-9]*)\/second\*\*|\*\*\$([0-9]+\.?[0-9]*)\*\*[^*]*per\s+second/i);
    const perSecondPlain = pricingText.match(/\$([0-9]+\.?[0-9]*)\s+per\s+second/i);
    const reverseDollarSec = pricingText.match(/([0-9]+\.?[0-9]*)\s*\$\s*per\s+(?:video\s+)?second/i);

    const perSecond =
      parseNumber(slashSecond?.[1]) ??
      (/second|\/s\b|every second|video you generated/i.test(pricingText)
        ? parseNumber(chargedPlain?.[1])
        : undefined) ??
      parseNumber(secondContextPrice?.[1]) ??
      parseNumber(perSecondBold?.[1] || perSecondBold?.[2]) ??
      parseNumber(perSecondPlain?.[1]) ??
      parseNumber(reverseDollarSec?.[1]);

    if (perSecond !== undefined) return { perSecond };

    const reverseDollarVideo = pricingText.match(/([0-9]+\.?[0-9]*)\s*\$\s*for\s+every/i);
    const perVideo = parseNumber(reverseDollarVideo?.[1]) ?? parseNumber(matches[0]?.[1]);
    return perVideo !== undefined ? { perVideo } : {};
  }

  const perThousandChars = pricingText.match(/\$([0-9]+\.?[0-9]*)\s*(?:\/|per)\s*(?:1k|1,000|1000)\s*(?:characters|chars)/i);
  if (perThousandChars) {
    const price = parseNumber(perThousandChars[1]);
    if (price !== undefined) return { perCharacter: price / 1000 };
  }

  const perCharacterPlain = pricingText.match(/\$([0-9]+\.?[0-9]*)\s*(?:\/|per)\s*(?:character|char)/i);
  if (perCharacterPlain) {
    const price = parseNumber(perCharacterPlain[1]);
    if (price !== undefined) return { perCharacter: price };
  }

  const perGeneration = pricingText.match(/\$([0-9]+\.?[0-9]*)\s*(?:\/|per)\s*(?:generation|output)/i);
  if (perGeneration) {
    const price = parseNumber(perGeneration[1]);
    if (price !== undefined) return { perOutput: price };
  }

  const slashSecond = pricingText.match(/\$([0-9]+\.?[0-9]*)\s*\/\s*s(?:ec(?:ond)?)?/i);
  const perSecondPattern = pricingText.match(/\*\*\$([0-9]+\.?[0-9]*)\/second\*\*|\*\*\$([0-9]+\.?[0-9]*)\*\*[^*]*per\s+second|\$([0-9]+\.?[0-9]*)\s+per\s+second/i);
  const perSecond =
    parseNumber(slashSecond?.[1]) ??
    parseNumber(perSecondPattern?.[1] || perSecondPattern?.[2] || perSecondPattern?.[3]);
  if (perSecond !== undefined) return { perSecond };

  const perCharBold = pricingText.match(/\*\*\$([0-9]+\.?[0-9]*)\*\*[^*]*per\s+character|\*\*\$([0-9]+\.?[0-9]*)\/char/i);
  const perCharacter = parseNumber(perCharBold?.[1] || perCharBold?.[2]);
  if (perCharacter !== undefined) return { perCharacter };

  const fallback = parseNumber(matches[0]?.[1]);
  return fallback !== undefined ? { perSecond: fallback } : {};
}

async function fetchFalModelPageText(modelId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://fal.ai/models/${modelId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export async function resolveModelPrice(input: ResolvePriceInput): Promise<ResolvedPrice> {
  const falApiPrice = parsePriceText(input.pricingInfoOverride, input.type);
  if (hasPrice(falApiPrice)) {
    return { pricing: falApiPrice, source: "fal-api" };
  }

  const pageText = await fetchFalModelPageText(input.id);
  const falPagePrice = parsePriceText(pageText ?? undefined, input.type);
  if (hasPrice(falPagePrice)) {
    return { pricing: falPagePrice, source: "fal-page" };
  }

  const litellm = findLiteLLMPrice(input.id, input.litellmMap, input.title);
  if (litellm) {
    const pricing = {
      perImage: litellm.perImage,
      perSecond: litellm.perSecond,
      perCharacter: litellm.perCharacter,
    };
    if (hasPrice(pricing)) return { pricing, source: "litellm" };
  }

  const override = findPriceOverride(input.id, input.title, input.type);
  if (override) {
    return { pricing: override.pricing, source: "override" };
  }

  return { pricing: {}, source: "none" };
}

export function logPriceCoverage(
  label: string,
  models: Array<{ id: string; name: string; pricing: ParsedPrice }>,
  sources: Map<string, PriceSource>
) {
  const sourceCounts = new Map<PriceSource, number>();
  let priced = 0;

  for (const model of models) {
    const source = sources.get(model.id) ?? "none";
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    if (hasPrice(model.pricing)) priced += 1;
  }

  const missing = models.filter(model => !hasPrice(model.pricing)).slice(0, 20);
  console.log(
    `[PriceCoverage] ${label}: ${priced}/${models.length} priced; sources=${JSON.stringify(Object.fromEntries(sourceCounts))}`
  );
  if (missing.length > 0) {
    console.log(
      `[PriceCoverage] ${label} missing sample: ${missing.map(model => `${model.id} (${model.name})`).join(", ")}`
    );
  }
}
