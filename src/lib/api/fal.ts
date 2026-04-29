import type { ImageModel, VideoModel, AudioModel } from '../types/models.js';
import { fetchArenaScores, findArenaScore } from './arena.js';

interface FalModel {
  id: string;
  title: string;
  category: string;
  shortDescription?: string;
  modelLab?: string;
  pricingInfoOverride?: string;
  status: string;
  removed: boolean;
  deprecated: boolean;
  licenseType?: string;
  publishedAt?: string;
  modelFamily?: string;
  hostingType?: string;
}

interface FalApiResponse {
  items: FalModel[];
  page: number;
  size: number;
  pages: number;
  total: number;
}

const FAL_API_BASE = 'https://fal.ai/api/models';
const PAGE_SIZE = 40;

async function fetchAllFalModels(): Promise<FalModel[]> {
  const allModels: FalModel[] = [];

  try {
    // Fetch first page to get total page count
    const firstResponse = await fetch(`${FAL_API_BASE}?page=1&size=${PAGE_SIZE}`);
    if (!firstResponse.ok) {
      throw new Error(`FAL API error: ${firstResponse.status}`);
    }

    const firstData = (await firstResponse.json()) as FalApiResponse;
    allModels.push(...firstData.items);

    const totalPages = firstData.pages;

    // Fetch remaining pages in parallel batches
    const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

    // Process in batches of 10 to avoid overwhelming the API
    const BATCH_SIZE = 10;
    for (let i = 0; i < remainingPages.length; i += BATCH_SIZE) {
      const batch = remainingPages.slice(i, i + BATCH_SIZE);
      const responses = await Promise.all(
        batch.map(page => fetch(`${FAL_API_BASE}?page=${page}&size=${PAGE_SIZE}`))
      );

      for (const response of responses) {
        if (response.ok) {
          const data = (await response.json()) as FalApiResponse;
          allModels.push(...data.items);
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch FAL.ai models:', error);
    return [];
  }

  return allModels;
}

function parseFalPrice(
  pricingText: string | undefined,
  type: 'image' | 'video' | 'audio'
): { perImage?: number; perSecond?: number; perVideo?: number; perCharacter?: number } {
  if (!pricingText) return {};

  // Extract all bold dollar amounts: **$X.XX**
  const boldPricePattern = /\*\*\$([0-9]+\.?[0-9]*)\*\*/g;
  const matches = [...pricingText.matchAll(boldPricePattern)];

  if (type === 'image') {
    // Pattern: "**$X.XX** per image" or "cost **$X.XX** per image"
    const perImageBold = pricingText.match(/\*\*\$([0-9]+\.?[0-9]*)\*\*[^.]*per image/i);
    if (perImageBold) {
      const price = parseFloat(perImageBold[1]);
      if (price > 0) return { perImage: price };
    }

    // Pattern: "$X.XX for 1024x1024" (GPT-Image style, take first/lowest quality)
    const perOutputImage = pricingText.match(/\$([0-9]+\.?[0-9]*)\s+for\s+1024x1024/i);
    if (perOutputImage) {
      const price = parseFloat(perOutputImage[1]);
      if (price > 0) return { perImage: price };
    }

    // Pattern: "X.XX per megapixel" (with or without $ sign)
    const perMegapixel = pricingText.match(/\$?([0-9]+\.?[0-9]*)\s+per\s+megapixel/i);
    if (perMegapixel) {
      const price = parseFloat(perMegapixel[1]);
      if (price > 0) return { perImage: price };
    }

    // Fallback: first bold price
    if (matches.length > 0) {
      const price = parseFloat(matches[0][1]);
      if (price > 0 && price < 10) return { perImage: price };
    }
    console.log(`[FalPrice] No image price parsed for: ${pricingText.substring(0, 100)}`);
    return {};
  }

  if (type === 'video') {
    // Check for per-second pricing patterns
    const perSecondPattern = /\*\*\$([0-9]+\.?[0-9]*)\/second\*\*|\*\*\$([0-9]+\.?[0-9]*)\*\*[^*]*per\s+second/i;
    const perSecondMatch = pricingText.match(perSecondPattern);
    if (perSecondMatch) {
      const price = parseFloat(perSecondMatch[1] || perSecondMatch[2]);
      if (price > 0) return { perSecond: price };
    }

    // Check for "charged" pattern (often per second)
    const chargedPattern = /charged\s+\*\*\$([0-9]+\.?[0-9]*)\*\*/i;
    const chargedMatch = pricingText.match(chargedPattern);
    if (chargedMatch) {
      const price = parseFloat(chargedMatch[1]);
      if (price > 0) return { perSecond: price };
    }

    // Fallback: use first bold price as per-video
    if (matches.length > 0) {
      const price = parseFloat(matches[0][1]);
      if (price > 0) return { perVideo: price };
    }
    return {};
  }

  if (type === 'audio') {
    // Check for per-second pricing
    const perSecondPattern = /\*\*\$([0-9]+\.?[0-9]*)\/second\*\*|\*\*\$([0-9]+\.?[0-9]*)\*\*[^*]*per\s+second/i;
    const perSecondMatch = pricingText.match(perSecondPattern);
    if (perSecondMatch) {
      const price = parseFloat(perSecondMatch[1] || perSecondMatch[2]);
      if (price > 0) return { perSecond: price };
    }

    // Check for per-character pricing
    const perCharPattern = /\*\*\$([0-9]+\.?[0-9]*)\*\*[^*]*per\s+character|\*\*\$([0-9]+\.?[0-9]*)\/char/i;
    const perCharMatch = pricingText.match(perCharPattern);
    if (perCharMatch) {
      const price = parseFloat(perCharMatch[1] || perCharMatch[2]);
      if (price > 0) return { perCharacter: price };
    }

    // Fallback: first bold price
    if (matches.length > 0) {
      const price = parseFloat(matches[0][1]);
      if (price > 0) return { perSecond: price };
    }
    return {};
  }

  return {};
}

function deduplicateByFamily<T extends { id: string }>(
  models: T[],
  getFamilyKey: (model: FalModel) => string,
  falModelMap: Map<string, FalModel>
): T[] {
  const familySeen = new Map<string, T>();

  for (const model of models) {
    const falModel = falModelMap.get(model.id);
    if (!falModel) {
      familySeen.set(model.id, model);
      continue;
    }

    const familyKey = getFamilyKey(falModel);
    if (!familySeen.has(familyKey)) {
      familySeen.set(familyKey, model);
    }
  }

  return Array.from(familySeen.values());
}

export async function fetchFalImageModels(): Promise<ImageModel[]> {
  try {
    const [allModels, arenaMap] = await Promise.all([
      fetchAllFalModels(),
      fetchArenaScores('text-to-image'),
    ]);

    const filtered = allModels.filter(
      m =>
        m.category === 'text-to-image' &&
        m.status === 'public' &&
        !m.removed &&
        !m.deprecated &&
        m.title && m.title.length > 0 &&
        m.pricingInfoOverride && m.pricingInfoOverride.length > 0
    );

    const allImageModels = allModels.filter(m => m.category === 'text-to-image');
    const publicModels = allImageModels.filter(m => m.status === 'public' && !m.removed && !m.deprecated);
    const withTitle = publicModels.filter(m => m.title && m.title.length > 0);
    const withPricing = withTitle.filter(m => m.pricingInfoOverride && m.pricingInfoOverride.length > 0);
    console.log(`[FalFilter] image: total=${allModels.length}, category=${allImageModels.length}, public=${publicModels.length}, withTitle=${withTitle.length}, withPricing=${withPricing.length}, filtered=${filtered.length}`);

    const falModelMap = new Map<string, FalModel>(filtered.map(m => [m.id, m]));

    const imageModels: ImageModel[] = filtered.map(item => {
      const priceData = parseFalPrice(item.pricingInfoOverride, 'image');
      if (item.id === 'fal-ai/gpt-image-1.5') {
        console.log(`[FalDebug] FULL PRICING: "${item.pricingInfoOverride}"`);
        console.log(`[FalDebug] parsed=${JSON.stringify(priceData)}`);
        console.log(`[FalDebug] has1024=${item.pricingInfoOverride?.includes('1024x1024')}`);
      }
      const arena = findArenaScore(item.title || item.id, arenaMap);

      // Derive popularity from Arena score when available (score >= 1200 yields > 0)
      let popularity = 0;
      if (arena !== null && arena.score >= 1200) {
        popularity = Math.min(100, Math.floor((arena.score - 1200) / 5));
      }

      return {
        id: item.id,
        name: item.title,
        provider: item.modelLab || 'Unknown',
        description: item.shortDescription || '',
        category: 'image' as const,
        pricing: {
          perImage: priceData.perImage,
        },
        qualityScore: arena?.score,
        tags: item.licenseType === 'commercial' ? ['commercial'] : ['open-source'],
        popularity,
        updatedAt: item.publishedAt || new Date().toISOString(),
        runCount: undefined,
      };
    });

    const deduplicated = deduplicateByFamily(
      imageModels,
      m => m.modelFamily || m.id,
      falModelMap
    );

    console.log(`Fetched ${deduplicated.length} image models from FAL.ai`);
    return deduplicated;
  } catch (error) {
    console.error('Failed to fetch FAL.ai image models:', error);
    return [];
  }
}

export async function fetchFalVideoModels(): Promise<VideoModel[]> {
  try {
    const [allModels, arenaMap] = await Promise.all([
      fetchAllFalModels(),
      fetchArenaScores('text-to-video'),
    ]);

    const filtered = allModels.filter(
      m =>
        m.category === 'text-to-video' &&
        m.status === 'public' &&
        !m.removed &&
        !m.deprecated &&
        m.title && m.title.length > 0 &&
        m.pricingInfoOverride && m.pricingInfoOverride.length > 0
    );

    const falModelMap = new Map<string, FalModel>(filtered.map(m => [m.id, m]));

    const videoModels: VideoModel[] = filtered.map(item => {
      const priceData = parseFalPrice(item.pricingInfoOverride, 'video');
      const arena = findArenaScore(item.title || item.id, arenaMap);

      // Derive popularity from Arena score when available (score >= 1200 yields > 0)
      let popularity = 0;
      if (arena !== null && arena.score >= 1200) {
        popularity = Math.min(100, Math.floor((arena.score - 1200) / 5));
      }

      return {
        id: item.id,
        name: item.title,
        provider: item.modelLab || 'Unknown',
        description: item.shortDescription || '',
        category: 'video' as const,
        pricing: {
          perSecond: priceData.perSecond,
          perVideo: priceData.perVideo,
        },
        qualityScore: arena?.score,
        tags: item.licenseType === 'commercial' ? ['commercial'] : ['open-source'],
        popularity,
        updatedAt: item.publishedAt || new Date().toISOString(),
        runCount: undefined,
      };
    });

    const deduplicated = deduplicateByFamily(
      videoModels,
      m => m.modelFamily || m.id,
      falModelMap
    );

    console.log(`Fetched ${deduplicated.length} video models from FAL.ai`);
    return deduplicated;
  } catch (error) {
    console.error('Failed to fetch FAL.ai video models:', error);
    return [];
  }
}

const AUDIO_CATEGORY_TO_TYPE: Record<string, string> = {
  'text-to-speech': 'tts',
  'speech-to-text': 'stt',
  'text-to-audio': 'music',
};

export async function fetchFalAudioModels(): Promise<AudioModel[]> {
  try {
    const allModels = await fetchAllFalModels();

    const AUDIO_CATEGORIES = new Set(['text-to-speech', 'speech-to-text', 'text-to-audio']);

    const filtered = allModels.filter(
      m =>
        AUDIO_CATEGORIES.has(m.category) &&
        m.status === 'public' &&
        !m.removed &&
        !m.deprecated &&
        m.title && m.title.length > 0 &&
        m.pricingInfoOverride && m.pricingInfoOverride.length > 0
    );

    const falModelMap = new Map<string, FalModel>(filtered.map(m => [m.id, m]));

    const audioModels: AudioModel[] = filtered.map(item => {
      const priceData = parseFalPrice(item.pricingInfoOverride, 'audio');
      const audioType = AUDIO_CATEGORY_TO_TYPE[item.category] || 'tts';

      return {
        id: item.id,
        name: item.title,
        provider: item.modelLab || 'Unknown',
        description: item.shortDescription || '',
        category: 'audio' as const,
        type: audioType,
        pricing: {
          perSecond: priceData.perSecond,
          perCharacter: priceData.perCharacter,
        },
        tags: item.licenseType === 'commercial' ? ['commercial'] : ['open-source'],
        popularity: 0,
        updatedAt: item.publishedAt || new Date().toISOString(),
        runCount: undefined,
      };
    });

    const deduplicated = deduplicateByFamily(
      audioModels,
      m => m.modelFamily || m.id,
      falModelMap
    );

    console.log(`Fetched ${deduplicated.length} audio models from FAL.ai`);
    return deduplicated;
  } catch (error) {
    console.error('Failed to fetch FAL.ai audio models:', error);
    return [];
  }
}
