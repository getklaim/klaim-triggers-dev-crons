import type { AudioModel } from "../types/models.js";

interface ElevenLabsPricingCard {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
}

const PRICING_URL = "https://elevenlabs.io/pricing/api";

const DESCRIPTION_BY_NAME: Record<string, string> = {
  "Flash / Turbo": "Low-latency ElevenLabs text-to-speech model family listed on the public API pricing page.",
  "Multilingual v2 / v3": "Higher-quality multilingual ElevenLabs text-to-speech model family listed on the public API pricing page.",
  "Scribe v1 / v2": "ElevenLabs batch speech-to-text model family listed on the public API pricing page.",
  "Scribe v2 Realtime": "ElevenLabs realtime speech-to-text model family listed on the public API pricing page.",
  Music: "ElevenLabs music generation product listed on the public API pricing page.",
  "Voice Isolator": "ElevenLabs audio cleanup product listed on the public API pricing page.",
  "Voice Changer": "ElevenLabs voice conversion product listed on the public API pricing page.",
  "Sound Effects": "ElevenLabs sound effects generation product listed on the public API pricing page.",
};

const PRICING_PRODUCTS = [
  { name: "Flash / Turbo", category: "Text to Speech" },
  { name: "Multilingual v2 / v3", category: "Text to Speech" },
  { name: "Scribe v1 / v2", category: "Speech to Text" },
  { name: "Scribe v2 Realtime", category: "Speech to Text" },
  { name: "Music", category: "Music Generation" },
  { name: "Voice Isolator", category: "Audio Processing" },
  { name: "Voice Changer", category: "Audio Processing" },
  { name: "Sound Effects", category: "Audio Generation" },
];

const FALLBACK_PRICING_CARDS: ElevenLabsPricingCard[] = [
  { id: "elevenlabs/flash-turbo", name: "Flash / Turbo", category: "Text to Speech", price: 0.05, unit: "1K characters" },
  { id: "elevenlabs/multilingual-v2-v3", name: "Multilingual v2 / v3", category: "Text to Speech", price: 0.1, unit: "1K characters" },
  { id: "elevenlabs/scribe-v1-v2", name: "Scribe v1 / v2", category: "Speech to Text", price: 0.22, unit: "hour" },
  { id: "elevenlabs/scribe-v2-realtime", name: "Scribe v2 Realtime", category: "Speech to Text", price: 0.39, unit: "hour" },
  { id: "elevenlabs/music", name: "Music", category: "Music Generation", price: 0.3, unit: "minute" },
  { id: "elevenlabs/voice-isolator", name: "Voice Isolator", category: "Audio Processing", price: 0.12, unit: "minute" },
  { id: "elevenlabs/voice-changer", name: "Voice Changer", category: "Audio Processing", price: 0.12, unit: "minute" },
  { id: "elevenlabs/sound-effects", name: "Sound Effects", category: "Audio Generation", price: 0.12, unit: "generation" },
];

function decodeHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePricingCards(html: string): ElevenLabsPricingCard[] {
  const text = decodeHtml(html);

  return PRICING_PRODUCTS.flatMap(product => {
    const directPattern = new RegExp(
      `${escapeRegExp(product.name)}\\s+${escapeRegExp(product.category)}\\s+\\$\\s*([0-9.]+)\\s+Price per (1K characters|hour|minute|generation)`,
      "i"
    );
    const directMatch = text.match(directPattern);
    const start = text.indexOf(`${product.name} ${product.category}`);
    const nearbyMatch =
      start >= 0
        ? text.slice(start, start + 240).match(/\$\s*([0-9.]+)\s+Price per (1K characters|hour|minute|generation)/i)
        : null;
    const match = directMatch ?? nearbyMatch;

    if (!match) return [];

    return [{
      id: `elevenlabs/${slugify(product.name)}`,
      name: product.name,
      category: product.category,
      price: Number.parseFloat(match[1]),
      unit: match[2],
    }];
  });
}

function toAudioType(category: string): string {
  if (category === "Text to Speech") return "tts";
  if (category === "Speech to Text") return "stt";
  if (category === "Audio Processing") return "tts";
  return "music";
}

function toPricing(card: ElevenLabsPricingCard): AudioModel["pricing"] {
  if (card.unit === "1K characters") return { perCharacter: card.price / 1000 };
  if (card.unit === "hour") return { perSecond: card.price / 3600 };
  if (card.unit === "minute") return { perMinute: card.price };
  if (card.unit === "generation") return { perOutput: card.price };
  return {};
}

export async function fetchElevenLabsAudioModels(): Promise<AudioModel[]> {
  try {
    let cards: ElevenLabsPricingCard[] = [];

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
        console.warn(`ElevenLabs pricing page unavailable: ${response.status}`);
        continue;
      }

      const html = await response.text();
      cards = parsePricingCards(html);
      if (cards.length > 0) break;

      await new Promise(resolve => setTimeout(resolve, attempt * 250));
    }

    if (cards.length === 0) {
      console.warn("ElevenLabs pricing page parsed 0 products; using fallback pricing-page snapshot");
      cards = FALLBACK_PRICING_CARDS;
    }

    const models = cards.map(card => ({
      id: card.id,
      name: card.name,
      provider: "ElevenLabs",
      description: DESCRIPTION_BY_NAME[card.name] || `${card.category} pricing from the public ElevenLabs API pricing page.`,
      category: "audio" as const,
      type: toAudioType(card.category),
      pricing: toPricing(card),
      languages: [],
      tags: ["elevenlabs", "pricing-page"],
      popularity: 0,
      updatedAt: new Date().toISOString(),
    }));

    console.log(`Fetched ${models.length} ElevenLabs audio model families from pricing page`);
    return models;
  } catch (error) {
    console.warn("Failed to fetch ElevenLabs pricing page:", error);
    return [];
  }
}
