import type { TextModel } from '../types/models.js';

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  context_length?: number;
  top_provider?: {
    max_completion_tokens?: number;
  };
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}


async function fetchArenaLeaderboard(): Promise<Map<string, number>> {
  const eloMap = new Map<string, number>();

  try {
    // Arena API is blocked (403), scrape leaderboard page instead
    const response = await fetch('https://arena.ai/leaderboard/text', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.warn('Arena page not available, using fallback ELO data');
      return getFallbackEloData();
    }

    const html = await response.text();

    // HTML table: title="model-name"> <span>model-name</span> ... <span class="text-sm">1493</span>
    const rowPattern = /title="([^"]+)">\s*<span class="max-w-full truncate">[^<]+<\/span>[\s\S]*?<span class="text-sm">(\d{3,4})<\/span>/g;
    let match;
    while ((match = rowPattern.exec(html)) !== null) {
      const name = match[1];
      const score = parseInt(match[2], 10);
      if (name && score > 800 && score < 2000) {
        const normalizedKey = normalizeModelName(name);
        if (!eloMap.has(normalizedKey)) {
          eloMap.set(normalizedKey, score);
        }
      }
    }

    if (eloMap.size > 0) {
      console.log(`Fetched ${eloMap.size} models from Arena leaderboard page`);
      return eloMap;
    }

    console.warn('No models parsed from Arena page, using fallback');
    return getFallbackEloData();
  } catch (error) {
    console.warn('Failed to fetch Arena leaderboard, using fallback:', error);
    return getFallbackEloData();
  }
}

function normalizeModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_]/g, '')
    .replace(/\s+/g, '')
    .replace(/20\d{6}/g, '')
    .replace(/preview/g, '')
    .replace(/latest/g, '')
    .replace(/thinking/g, '')
    .replace(/\d+k$/g, '');
}

function findEloScore(modelId: string, eloMap: Map<string, number>): number | null {
  const normalized = normalizeModelName(modelId);

  for (const [key, score] of eloMap) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return score;
    }
  }

  const modelName = modelId.split('/').pop() || modelId;
  const normalizedName = normalizeModelName(modelName);

  for (const [key, score] of eloMap) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return score;
    }
  }

  return null;
}

function getFallbackEloData(): Map<string, number> {
  const fallbackData: Record<string, number> = {
    'gemini3pro': 1490,
    'grok41': 1477,
    'gemini3flash': 1472,
    'claudeopus45': 1467,
    'gpt51': 1458,
    'gemini25pro': 1451,
    'claudesonnet45': 1450,
    'claudeopus41': 1445,
    'gpt52': 1445,
    'gpt45': 1444,
    'chatgpt4o': 1442,
    'glm47': 1441,
    'qwen3max': 1434,
    'o3': 1433,
    'grok4': 1430,
    'glm46': 1425,
    'deepseekv32': 1418,
    'deepseekr1': 1397,
    'deepseekv3': 1394,
    'claudesonnet4': 1390,
    'claude37sonnet': 1389,
    'o1': 1388,
    'gpt41mini': 1382,
    'qwen235b': 1374,
    'qwen25max': 1374,
    'claude35sonnet': 1373,
    'mistralmedium': 1384,
    'mistrallarge3': 1411,
    'gemma327b': 1365,
    'o3mini': 1364,
    'gemini20flash': 1361,
    'mistralsmall': 1356,
    'llama4maverick': 1340,
    'llama4scout': 1320,
    'llama33': 1310,
    'llama31': 1280,
    'llama318b': 1250,
    'llama3170b': 1270,
    'llama31405b': 1300,
    'phi4': 1280,
    'phi3': 1200,
    'commandrplus': 1260,
    'commandr': 1220,
    'yi34b': 1180,
    'mixtral8x22b': 1240,
    'mixtral8x7b': 1200,
  };

  const map = new Map<string, number>();
  for (const [key, value] of Object.entries(fallbackData)) {
    map.set(key, value);
  }
  return map;
}

function calculatePopularityFromElo(elo: number | null): number {
  if (elo === null) return 0;

  if (elo >= 1450) return Math.min(100, 80 + Math.floor((elo - 1450) / 5));
  if (elo >= 1400) return 60 + Math.floor((elo - 1400) / 2.5);
  if (elo >= 1350) return 40 + Math.floor((elo - 1350) / 2.5);
  if (elo >= 1300) return 20 + Math.floor((elo - 1300) / 2.5);
  if (elo >= 1200) return Math.floor((elo - 1200) / 5);
  return 0;
}

// Fallback: output token price per 1M tokens → popularity
// 비쌀수록 flagship급 모델일 가능성 높음
function calculatePopularityFromPrice(outputPricePerMillion: number): number {
  if (outputPricePerMillion >= 100) return 85;
  if (outputPricePerMillion >= 30) return 75;
  if (outputPricePerMillion >= 10) return 65;
  if (outputPricePerMillion >= 3) return 50;
  if (outputPricePerMillion >= 1) return 30;
  if (outputPricePerMillion >= 0.1) return 15;
  return 5;
}

function calculatePopularity(elo: number | null, outputPricePerMillion: number): number {
  if (elo !== null) return calculatePopularityFromElo(elo);
  return calculatePopularityFromPrice(outputPricePerMillion);
}

function getTags(elo: number | null, outputPricePerMillion: number): string[] {
  if (elo !== null && elo >= 1430) return ['popular'];
  if (elo === null && outputPricePerMillion >= 30) return ['popular'];
  return [];
}

function isImageOrVisionModel(modelId: string, modelName: string): boolean {
  const lowerModelId = modelId.toLowerCase();
  const lowerName = modelName.toLowerCase();

  const imageKeywords = [
    'image',
    'vision',
    'img2img',
    'txt2img',
    'diffusion',
    'dall-e',
    'dalle',
    'midjourney',
    'stable-diffusion',
    'flux',
    'imagen',
    'ideogram',
    'recraft',
    'playground',
  ];

  for (const keyword of imageKeywords) {
    if (lowerModelId.includes(keyword) || lowerName.includes(keyword)) {
      return true;
    }
  }

  return false;
}

export async function fetchOpenRouterModels(): Promise<TextModel[]> {
  try {
    const [modelsResponse, eloMap] = await Promise.all([
      fetch('https://openrouter.ai/api/v1/models'),
      fetchArenaLeaderboard(),
    ]);

    if (!modelsResponse.ok) {
      throw new Error(`OpenRouter API error: ${modelsResponse.status}`);
    }

    const data = (await modelsResponse.json()) as OpenRouterResponse;

    return data.data
      .filter((model: OpenRouterModel) => {
        const promptPrice = parseFloat(model.pricing?.prompt || '0');
        const completionPrice = parseFloat(model.pricing?.completion || '0');
        if (promptPrice <= 0 && completionPrice <= 0) return false;
        if (isImageOrVisionModel(model.id, model.name || '')) return false;
        return true;
      })
      .map((model: OpenRouterModel): TextModel => {
        const elo = findEloScore(model.id, eloMap);
        const outputPrice = parseFloat(model.pricing?.completion || '0') * 1000000;
        return {
          id: model.id,
          name: model.name || model.id.split('/').pop() || model.id,
          provider: model.id.split('/')[0] || 'unknown',
          description: model.description || '',
          category: 'text' as const,
          pricing: {
            prompt: parseFloat(model.pricing?.prompt || '0') * 1000000,
            completion: outputPrice,
          },
          contextLength: model.context_length || 0,
          tags: getTags(elo, outputPrice),
          popularity: calculatePopularity(elo, outputPrice),
          arenaElo: elo,
          updatedAt: new Date().toISOString(),
          capabilities: [],
        };
      })
      .sort((a: TextModel, b: TextModel) => b.popularity - a.popularity);
  } catch (error) {
    console.error('Failed to fetch OpenRouter models:', error);
    return [];
  }
}