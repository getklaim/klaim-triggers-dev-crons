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
};

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

function parsePricingCards(html: string): ElevenLabsPricingCard[] {
  const text = decodeHtml(html);
  const pattern =
    /(Flash \/ Turbo|Multilingual v2 \/ v3|Scribe v1 \/ v2|Scribe v2 Realtime|Music)\s+(Text to Speech|Speech to Text|Music Generation)\s+\$([0-9.]+)\s+Price per (1K characters|hour|minute)/g;

  return [...text.matchAll(pattern)].map(match => ({
    id: `elevenlabs/${slugify(match[1])}`,
    name: match[1],
    category: match[2],
    price: Number.parseFloat(match[3]),
    unit: match[4],
  }));
}

function toAudioType(category: string): string {
  if (category === "Text to Speech") return "tts";
  if (category === "Speech to Text") return "stt";
  return "music";
}

function toPricing(card: ElevenLabsPricingCard): AudioModel["pricing"] {
  if (card.unit === "1K characters") return { perCharacter: card.price / 1000 };
  if (card.unit === "hour") return { perSecond: card.price / 3600 };
  if (card.unit === "minute") return { perMinute: card.price };
  return {};
}

export async function fetchElevenLabsAudioModels(): Promise<AudioModel[]> {
  try {
    const response = await fetch(PRICING_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      console.warn(`ElevenLabs pricing page unavailable: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const cards = parsePricingCards(html);

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
