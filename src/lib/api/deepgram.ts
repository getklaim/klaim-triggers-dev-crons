import type { AudioModel } from "../types/models.js";
import { resolveAudioQualityScore, scoreToPopularity } from "../scoring/media-score.js";

interface DeepgramPricingCard {
  id: string;
  name: string;
  category: "Speech to Text" | "Text to Speech" | "Voice Agent";
  price: number;
  unit: "minute" | "1K characters";
  description: string;
  realtime?: boolean;
}

const PRICING_URL = "https://deepgram.com/pricing";

const DEEPGRAM_PRODUCTS = [
  {
    id: "deepgram/flux-english",
    name: "Flux English",
    category: "Speech to Text",
    description: "Deepgram conversational speech recognition for English real-time voice agents.",
    pricePattern: /Flux English.*?\$\s*([0-9.]+)\s*\/min/is,
    fallbackPrice: 0.0065,
    realtime: true,
  },
  {
    id: "deepgram/flux-multilingual",
    name: "Flux Multilingual",
    category: "Speech to Text",
    description: "Deepgram conversational speech recognition for multilingual real-time voice agents.",
    pricePattern: /Flux Multilingual.*?\$\s*([0-9.]+)\s*\/min/is,
    fallbackPrice: 0.0078,
    realtime: true,
  },
  {
    id: "deepgram/nova-3-monolingual",
    name: "Nova-3 Monolingual",
    category: "Speech to Text",
    description: "Deepgram high-accuracy monolingual speech-to-text model for general transcription.",
    pricePattern: /Nova-3 Monolingual.*?\$\s*([0-9.]+)\s*\/min/is,
    fallbackPrice: 0.0048,
    realtime: true,
  },
  {
    id: "deepgram/nova-3-multilingual",
    name: "Nova-3 Multilingual",
    category: "Speech to Text",
    description: "Deepgram high-accuracy multilingual speech-to-text model with automatic language detection.",
    pricePattern: /Nova-3 Multilingual.*?\$\s*([0-9.]+)\s*\/min/is,
    fallbackPrice: 0.0058,
    realtime: true,
  },
  {
    id: "deepgram/aura-2",
    name: "Aura-2",
    category: "Text to Speech",
    description: "Deepgram natural, low-latency text-to-speech model for voice assistants.",
    pricePattern: /Aura-2.*?\$\s*([0-9.]+)\s*\/1k characters/is,
    fallbackPrice: 0.03,
    realtime: true,
  },
  {
    id: "deepgram/aura-1",
    name: "Aura-1",
    category: "Text to Speech",
    description: "Deepgram low-latency text-to-speech model for conversational AI applications.",
    pricePattern: /Aura-1.*?\$\s*([0-9.]+)\s*\/1k characters/is,
    fallbackPrice: 0.015,
    realtime: true,
  },
  {
    id: "deepgram/voice-agent-standard",
    name: "Voice Agent Standard",
    category: "Voice Agent",
    description: "Deepgram real-time Voice Agent API standard tier billed by websocket connection time.",
    pricePattern: /Standard\s+\$\s*([0-9.]+)\s*\/min/is,
    fallbackPrice: 0.075,
    realtime: true,
  },
] as const;

function decodeHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePricingCards(html: string): DeepgramPricingCard[] {
  const text = decodeHtml(html);

  return DEEPGRAM_PRODUCTS.map(product => {
    const match = text.match(product.pricePattern);
    const price = match ? Number.parseFloat(match[1]) : product.fallbackPrice;

    return {
      id: product.id,
      name: product.name,
      category: product.category,
      price,
      unit: product.category === "Text to Speech" ? "1K characters" : "minute",
      description: product.description,
      realtime: product.realtime,
    };
  });
}

function toAudioType(category: DeepgramPricingCard["category"]): string {
  if (category === "Text to Speech") return "tts";
  return "stt";
}

function toPricing(card: DeepgramPricingCard): AudioModel["pricing"] {
  if (card.unit === "1K characters") return { perCharacter: card.price / 1000 };
  return { perMinute: card.price, perSecond: card.price / 60 };
}

function toAudioModels(cards: DeepgramPricingCard[]): AudioModel[] {
  return cards.map((card, index) => {
    const type = toAudioType(card.category);
    const qualityScore = resolveAudioQualityScore({
      id: card.id,
      name: card.name,
      provider: "Deepgram",
      category: card.category,
      audioType: type,
      rankIndex: index,
      totalCount: cards.length,
    });

    return {
      id: card.id,
      name: card.name,
      provider: "Deepgram",
      description: `${card.description} Pricing from the public Deepgram pricing page.`,
      category: "audio" as const,
      type,
      pricing: toPricing(card),
      languages: card.name.includes("Multilingual") ? ["multi"] : [],
      qualityScore,
      naturalness: type === "tts" ? qualityScore : undefined,
      accuracy: type === "stt" ? qualityScore : undefined,
      realtime: card.realtime,
      tags: ["deepgram", "pricing-page", type],
      popularity: scoreToPopularity(qualityScore),
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function fetchDeepgramAudioModels(): Promise<AudioModel[]> {
  try {
    let cards: DeepgramPricingCard[] = [];

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(PRICING_URL, {
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        console.warn(`Deepgram pricing page unavailable: ${response.status}`);
        continue;
      }

      cards = parsePricingCards(await response.text());
      if (cards.length > 0) break;

      await new Promise(resolve => setTimeout(resolve, attempt * 250));
    }

    if (cards.length === 0) {
      console.warn("Deepgram pricing page parsed 0 products; using fallback pricing-page snapshot");
      cards = parsePricingCards("");
    }

    const models = toAudioModels(cards);

    console.log(`Fetched ${models.length} Deepgram audio model families from pricing page`);
    return models;
  } catch (error) {
    console.warn("Failed to fetch Deepgram pricing page:", error);
    const fallbackModels = toAudioModels(parsePricingCards(""));
    console.warn(`Using ${fallbackModels.length} Deepgram fallback pricing-page snapshot models`);
    return fallbackModels;
  }
}
