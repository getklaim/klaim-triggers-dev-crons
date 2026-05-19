import type { ImageModel, VideoModel, AudioModel } from '../types/models.js';
import { fetchArenaScores, findArenaScore } from './arena.js';
import { fetchLiteLLMPricing } from './litellm.js';
import { logPriceCoverage, resolveModelPrice, type PriceSource } from '../pricing/price-resolver.js';

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
let allFalModelsPromise: Promise<FalModel[]> | null = null;

async function fetchFalModelsPage(page: number): Promise<FalApiResponse | null> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${FAL_API_BASE}?page=${page}&size=${PAGE_SIZE}`);
      if (response.ok) {
        return (await response.json()) as FalApiResponse;
      }
    } catch {
      // Retry below.
    }

    await new Promise(resolve => setTimeout(resolve, attempt * 250));
  }

  return null;
}

async function fetchAllFalModels(): Promise<FalModel[]> {
  if (allFalModelsPromise) return allFalModelsPromise;
  allFalModelsPromise = fetchAllFalModelsUncached();
  return allFalModelsPromise;
}

async function fetchAllFalModelsUncached(): Promise<FalModel[]> {
  const allModels: FalModel[] = [];

  try {
    // Fetch first page to get total page count
    const firstData = await fetchFalModelsPage(1);
    if (!firstData) {
      throw new Error("FAL API error: failed to fetch first page");
    }

    allModels.push(...firstData.items);

    const totalPages = firstData.pages;

    // Fetch remaining pages in parallel batches
    const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

    // Process in batches of 10 to avoid overwhelming the API
    const BATCH_SIZE = 10;
    for (let i = 0; i < remainingPages.length; i += BATCH_SIZE) {
      const batch = remainingPages.slice(i, i + BATCH_SIZE);
      const pages = await Promise.all(batch.map(page => fetchFalModelsPage(page)));

      for (const data of pages) {
        if (data) allModels.push(...data.items);
      }
    }
  } catch (error) {
    console.error('Failed to fetch FAL.ai models:', error);
    return [];
  }

  return allModels;
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
    const [allModels, arenaMap, litellmMap] = await Promise.all([
      fetchAllFalModels(),
      fetchArenaScores('text-to-image'),
      fetchLiteLLMPricing(),
    ]);

    const filtered = allModels.filter(
      m =>
        m.category === 'text-to-image' &&
        m.status === 'public' &&
        !m.removed &&
        !m.deprecated &&
        m.title && m.title.length > 0
    );

    const allImageModels = allModels.filter(m => m.category === 'text-to-image');
    const publicModels = allImageModels.filter(m => m.status === 'public' && !m.removed && !m.deprecated);
    const withTitle = publicModels.filter(m => m.title && m.title.length > 0);
    const withPricing = withTitle.filter(m => m.pricingInfoOverride && m.pricingInfoOverride.length > 0);

    const falModelMap = new Map<string, FalModel>(filtered.map(m => [m.id, m]));

    const sourceByModelId = new Map<string, PriceSource>();
    const imageModels: ImageModel[] = await Promise.all(filtered.map(async item => {
      const resolvedPrice = await resolveModelPrice({
        id: item.id,
        title: item.title,
        type: 'image',
        pricingInfoOverride: item.pricingInfoOverride,
        litellmMap,
      });
      sourceByModelId.set(item.id, resolvedPrice.source);
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
          perImage: resolvedPrice.pricing.perImage,
          perSecond: resolvedPrice.pricing.perSecond,
        },
        qualityScore: arena?.score,
        tags: item.licenseType === 'commercial' ? ['commercial'] : ['open-source'],
        popularity,
        updatedAt: item.publishedAt || new Date().toISOString(),
        runCount: undefined,
      };
    }));

    const deduplicated = deduplicateByFamily(
      imageModels,
      m => m.modelFamily || m.title || m.id,
      falModelMap
    );

    logPriceCoverage('image', deduplicated, sourceByModelId);
    console.log(`Fetched ${deduplicated.length} image models from FAL.ai`);
    return deduplicated;
  } catch (error) {
    console.error('Failed to fetch FAL.ai image models:', error);
    return [];
  }
}

export async function fetchFalVideoModels(): Promise<VideoModel[]> {
  try {
    const [allModels, arenaMap, litellmMap] = await Promise.all([
      fetchAllFalModels(),
      fetchArenaScores('text-to-video'),
      fetchLiteLLMPricing(),
    ]);

    const filtered = allModels.filter(
      m =>
        m.category === 'text-to-video' &&
        m.status === 'public' &&
        !m.removed &&
        !m.deprecated &&
        m.title && m.title.length > 0
    );

    const falModelMap = new Map<string, FalModel>(filtered.map(m => [m.id, m]));

    const sourceByModelId = new Map<string, PriceSource>();
    const videoModels: VideoModel[] = await Promise.all(filtered.map(async item => {
      const resolvedPrice = await resolveModelPrice({
        id: item.id,
        title: item.title,
        type: 'video',
        pricingInfoOverride: item.pricingInfoOverride,
        litellmMap,
      });
      sourceByModelId.set(item.id, resolvedPrice.source);
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
          perSecond: resolvedPrice.pricing.perSecond,
          perVideo: resolvedPrice.pricing.perVideo,
        },
        qualityScore: arena?.score,
        tags: item.licenseType === 'commercial' ? ['commercial'] : ['open-source'],
        popularity,
        updatedAt: item.publishedAt || new Date().toISOString(),
        runCount: undefined,
      };
    }));

    const deduplicated = deduplicateByFamily(
      videoModels,
      m => m.modelFamily || m.title || m.id,
      falModelMap
    );

    logPriceCoverage('video', deduplicated, sourceByModelId);
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
    const [allModels, litellmMap] = await Promise.all([
      fetchAllFalModels(),
      fetchLiteLLMPricing(),
    ]);

    const AUDIO_CATEGORIES = new Set(['text-to-speech', 'speech-to-text', 'text-to-audio']);

    const filtered = allModels.filter(
      m =>
        AUDIO_CATEGORIES.has(m.category) &&
        m.status === 'public' &&
        !m.removed &&
        !m.deprecated &&
        m.title && m.title.length > 0
    );

    const falModelMap = new Map<string, FalModel>(filtered.map(m => [m.id, m]));

    const sourceByModelId = new Map<string, PriceSource>();
    const audioModels: AudioModel[] = await Promise.all(filtered.map(async item => {
      const resolvedPrice = await resolveModelPrice({
        id: item.id,
        title: item.title,
        type: 'audio',
        pricingInfoOverride: item.pricingInfoOverride,
        litellmMap,
      });
      sourceByModelId.set(item.id, resolvedPrice.source);
      const audioType = AUDIO_CATEGORY_TO_TYPE[item.category] || 'tts';

      return {
        id: item.id,
        name: item.title,
        provider: item.modelLab || 'Unknown',
        description: item.shortDescription || '',
        category: 'audio' as const,
        type: audioType,
        pricing: {
          perSecond: resolvedPrice.pricing.perSecond,
          perCharacter: resolvedPrice.pricing.perCharacter,
          perOutput: resolvedPrice.pricing.perOutput,
        },
        tags: item.licenseType === 'commercial' ? ['commercial'] : ['open-source'],
        popularity: 0,
        updatedAt: item.publishedAt || new Date().toISOString(),
        runCount: undefined,
      };
    }));

    const deduplicated = deduplicateByFamily(
      audioModels,
      m => m.modelFamily || m.title || m.id,
      falModelMap
    );

    logPriceCoverage('audio', deduplicated, sourceByModelId);
    console.log(`Fetched ${deduplicated.length} audio models from FAL.ai`);
    return deduplicated;
  } catch (error) {
    console.error('Failed to fetch FAL.ai audio models:', error);
    return [];
  }
}
