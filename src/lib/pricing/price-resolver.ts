import { findLiteLLMPrice, type LiteLLMPricing } from "../api/litellm.js";
import { findPriceOverride } from "./price-overrides.js";

export type PriceType = "image" | "video" | "audio";
export type PriceSource = "fal-api" | "fal-page" | "litellm" | "override" | "none";

export interface ParsedPrice {
  perImage?: number;
  perMegapixel?: number;
  perSecond?: number;
  perMinute?: number;
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
  return Object.values(pricing).some(value => value !== undefined && value !== null && value >= 0);
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const price = parseFloat(value);
  return price > 0 ? price : undefined;
}

function parseNonNegativeNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const price = parseFloat(value);
  return price >= 0 ? price : undefined;
}

function normalizePriceText(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEndpointBilling(pricingText: string, type: PriceType): ParsedPrice {
  const unescaped = pricingText.replace(/\\"/g, "\"");
  const billingMatch = unescaped.match(/"endpointBilling":\{[^}]*"billing_unit":"([^"]+)"[^}]*"price":([0-9.]+)/);
  if (!billingMatch) return {};

  const unit = billingMatch[1].toLowerCase();
  const price = parseNonNegativeNumber(billingMatch[2]);
  if (price === undefined) return {};

  if (type === "image") {
    if (/megapixels?/.test(unit)) return { perMegapixel: price };
    if (/images?|units?|requests?|compute seconds?/.test(unit)) return { perImage: price };
    return {};
  }

  if (type === "video") {
    if (/seconds?|compute seconds?/.test(unit)) return { perSecond: price };
    if (/minutes?/.test(unit)) return { perSecond: price / 60 };
    if (/videos?|units?/.test(unit)) return { perVideo: price };
    return {};
  }

  if (/30 seconds?/.test(unit)) return { perOutput: price };
  if (/seconds?|compute seconds?/.test(unit)) return { perSecond: price };
  if (/minutes?/.test(unit)) return { perMinute: price };
  if (/characters?|chars?/.test(unit)) return { perCharacter: price };
  if (/generations?|outputs?|audio|videos?|units?/.test(unit)) return { perOutput: price };

  return {};
}

export function parsePriceText(
  pricingText: string | undefined,
  type: PriceType
): ParsedPrice {
  if (!pricingText) return {};

  const endpointBilling = parseEndpointBilling(pricingText, type);
  if (hasPrice(endpointBilling)) return endpointBilling;

  const text = normalizePriceText(pricingText);
  const boldPricePattern = /\*\*\$?\s*([0-9]+\.?[0-9]*)\*\*/g;
  const matches = [...text.matchAll(boldPricePattern)];

  if (type === "image") {
    if (text.includes("per 1M") && text.includes("Image tokens")) {
      return { perImage: 0.07 };
    }

    const perImageBold = text.match(/\*\*\$\s*([0-9]+\.?[0-9]*)\*\*[^.]*per image/i);
    const perImagePlain = text.match(/\$\s*([0-9]+\.?[0-9]*)\s+per\s+image/i);
    const reverseDollar = text.match(/\*\*([0-9]+\.?[0-9]*)\$\*\*/);
    const perOutputImage = text.match(/\$([0-9]+\.?[0-9]*)\s+for\s+1024x1024/i);
    const price =
      parseNumber(perImageBold?.[1]) ??
      parseNumber(perImagePlain?.[1]) ??
      parseNumber(reverseDollar?.[1]) ??
      parseNumber(perOutputImage?.[1]);

    if (price !== undefined) return { perImage: price };

    const perMegapixel = text.match(/\$?\s*([0-9]+\.?[0-9]*)\s+per\s+megapixel/i);
    const megapixelPrice = parseNumber(perMegapixel?.[1]);
    if (megapixelPrice !== undefined) return { perMegapixel: megapixelPrice };

    if (matches.length > 0 && !text.includes("per 1M") && !text.includes("tokens")) {
      const fallback = parseNumber(matches[0][1]);
      if (fallback !== undefined && fallback < 1) return { perImage: fallback };
    }
    return {};
  }

  if (type === "video") {
    const slashSecond = text.match(/\$\s*([0-9]+\.?[0-9]*)\s*\/\s*s(?:ec(?:ond)?)?/i);
    const chargedPlain = text.match(/charged\s+\$\s*([0-9]+\.?[0-9]*)/i);
    const secondContextPrice = text.match(/second[^$]*\$\s*([0-9]+\.?[0-9]*)/i);
    const perSecondBold = text.match(/\*\*\$\s*([0-9]+\.?[0-9]*)\/second\*\*|\*\*\$\s*([0-9]+\.?[0-9]*)\*\*[^*]*per\s+second/i);
    const perSecondPlain = text.match(/\$\s*([0-9]+\.?[0-9]*)\s+per\s+second/i);
    const reverseDollarSec = text.match(/([0-9]+\.?[0-9]*)\s*\$\s*per\s+(?:video\s+)?second/i);

    const perSecond =
      parseNumber(slashSecond?.[1]) ??
      (/second|\/s\b|every second|video you generated/i.test(text)
        ? parseNumber(chargedPlain?.[1])
        : undefined) ??
      parseNumber(secondContextPrice?.[1]) ??
      parseNumber(perSecondBold?.[1] || perSecondBold?.[2]) ??
      parseNumber(perSecondPlain?.[1]) ??
      parseNumber(reverseDollarSec?.[1]);

    if (perSecond !== undefined) return { perSecond };

    const reverseDollarVideo = text.match(/([0-9]+\.?[0-9]*)\s*\$\s*for\s+every/i);
    const perVideo = parseNumber(reverseDollarVideo?.[1]) ?? parseNumber(matches[0]?.[1]);
    return perVideo !== undefined ? { perVideo } : {};
  }

  const perThousandChars = text.match(/\$\s*([0-9]+\.?[0-9]*)\s*(?:\/|per)\s*(?:1k|1,000|1000)\s*(?:characters?|chars?)/i);
  if (perThousandChars) {
    const price = parseNumber(perThousandChars[1]);
    if (price !== undefined) return { perCharacter: price / 1000 };
  }

  const perCharacterPlain = text.match(/\$\s*([0-9]+\.?[0-9]*)\s*(?:\/|per)\s*(?:characters?|chars?)/i);
  if (perCharacterPlain) {
    const price = parseNumber(perCharacterPlain[1]);
    if (price !== undefined) return { perCharacter: price };
  }

  const perGeneration = text.match(/\$\s*([0-9]+\.?[0-9]*)\s*(?:\/|per)\s*(?:generation|output|audio)\b/i);
  if (perGeneration) {
    const price = parseNumber(perGeneration[1]);
    if (price !== undefined) return { perOutput: price };
  }

  const perMinutePattern = text.match(/\$\s*([0-9]+\.?[0-9]*)\s*(?:\/|per)\s+minutes?\b/i);
  const perMinute = parseNumber(perMinutePattern?.[1]);
  if (perMinute !== undefined) return { perMinute };

  const slashSecond = text.match(/\$\s*([0-9]+\.?[0-9]*)\s*\/\s*s(?:ec(?:ond)?)?/i);
  const perGeneratedAudioSecond = text.match(/\$?\s*([0-9]+\.?[0-9]*)\s+per\s+generated\s+audio\s+seconds?/i);
  const perSecondPattern = text.match(/\*\*\$\s*([0-9]+\.?[0-9]*)\/second\*\*|\*\*\$\s*([0-9]+\.?[0-9]*)\*\*[^*]*per\s+(?:audio\s+)?seconds?|\$\s*([0-9]+\.?[0-9]*)\s+per\s+(?:compute\s+|audio\s+)?seconds?/i);
  const perSecond =
    parseNumber(slashSecond?.[1]) ??
    parseNumber(perGeneratedAudioSecond?.[1]) ??
    parseNumber(perSecondPattern?.[1] || perSecondPattern?.[2] || perSecondPattern?.[3]);
  if (perSecond !== undefined) return { perSecond };

  const perCharBold = text.match(/\*\*\$\s*([0-9]+\.?[0-9]*)\*\*[^*]*per\s+characters?|\*\*\$\s*([0-9]+\.?[0-9]*)\/char/i);
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
      perImage: litellm.perImage && litellm.perImage > 0 ? litellm.perImage : undefined,
      perSecond: litellm.perSecond && litellm.perSecond > 0 ? litellm.perSecond : undefined,
      perCharacter: litellm.perCharacter && litellm.perCharacter > 0 ? litellm.perCharacter : undefined,
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
