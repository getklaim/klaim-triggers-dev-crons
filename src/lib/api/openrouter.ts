import type { TextModel } from "../types/models.js";
import {
  fetchArenaScores,
  findArenaScore,
  type ArenaEntry,
} from "./arena.js";

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

function getFallbackEloData(): Map<string, ArenaEntry> {
  const fallbackData: Record<string, number> = {
    gemini3pro: 1490,
    grok41: 1477,
    gemini3flash: 1472,
    claudeopus45: 1467,
    gpt51: 1458,
    gemini25pro: 1451,
    claudesonnet45: 1450,
    claudeopus41: 1445,
    gpt52: 1445,
    gpt45: 1444,
    chatgpt4o: 1442,
    glm47: 1441,
    qwen3max: 1434,
    o3: 1433,
    grok4: 1430,
    glm46: 1425,
    deepseekv32: 1418,
    deepseekr1: 1397,
    deepseekv3: 1394,
    claudesonnet4: 1390,
    claude37sonnet: 1389,
    o1: 1388,
    gpt41mini: 1382,
    qwen235b: 1374,
    qwen25max: 1374,
    claude35sonnet: 1373,
    mistralmedium: 1384,
    mistrallarge3: 1411,
    gemma327b: 1365,
    o3mini: 1364,
    gemini20flash: 1361,
    mistralsmall: 1356,
    llama4maverick: 1340,
    llama4scout: 1320,
    llama33: 1310,
    llama31: 1280,
    llama318b: 1250,
    llama3170b: 1270,
    llama31405b: 1300,
    phi4: 1280,
    phi3: 1200,
    commandrplus: 1260,
    commandr: 1220,
    yi34b: 1180,
    mixtral8x22b: 1240,
    mixtral8x7b: 1200,
  };

  const map = new Map<string, ArenaEntry>();
  for (const [key, value] of Object.entries(fallbackData)) {
    map.set(key, { score: value, url: "" });
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
function calculatePopularityFromPrice(outputPricePerMillion: number): number {
  if (outputPricePerMillion >= 100) return 85;
  if (outputPricePerMillion >= 30) return 75;
  if (outputPricePerMillion >= 10) return 65;
  if (outputPricePerMillion >= 3) return 50;
  if (outputPricePerMillion >= 1) return 30;
  if (outputPricePerMillion >= 0.1) return 15;
  return 5;
}

function calculatePopularity(
  elo: ArenaEntry | null,
  outputPricePerMillion: number,
): number {
  if (elo !== null) return calculatePopularityFromElo(elo.score);
  return calculatePopularityFromPrice(outputPricePerMillion);
}

function getTags(
  elo: ArenaEntry | null,
  outputPricePerMillion: number,
): string[] {
  if (elo !== null && elo.score >= 1430) return ["popular"];
  if (elo === null && outputPricePerMillion >= 30) return ["popular"];
  return [];
}

function isImageOrVisionModel(modelId: string, modelName: string): boolean {
  const lowerModelId = modelId.toLowerCase();
  const lowerName = modelName.toLowerCase();

  const imageKeywords = [
    "image",
    "vision",
    "img2img",
    "txt2img",
    "diffusion",
    "dall-e",
    "dalle",
    "midjourney",
    "stable-diffusion",
    "flux",
    "imagen",
    "ideogram",
    "recraft",
    "playground",
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
    // Fetch text leaderboard; fall back to static data if scraping fails
    const arenaScores = await fetchArenaScores("text");
    const eloMap =
      arenaScores.size > 0 ? arenaScores : getFallbackEloData();

    const modelsResponse = await fetch("https://openrouter.ai/api/v1/models");

    if (!modelsResponse.ok) {
      throw new Error(`OpenRouter API error: ${modelsResponse.status}`);
    }

    const data = (await modelsResponse.json()) as OpenRouterResponse;

    return data.data
      .filter((model: OpenRouterModel) => {
        const promptPrice = parseFloat(model.pricing?.prompt || "0");
        const completionPrice = parseFloat(model.pricing?.completion || "0");
        if (promptPrice <= 0 && completionPrice <= 0) return false;
        if (isImageOrVisionModel(model.id, model.name || "")) return false;
        return true;
      })
      .map((model: OpenRouterModel): TextModel => {
        const eloEntry = findArenaScore(model.id, eloMap);
        const outputPrice =
          parseFloat(model.pricing?.completion || "0") * 1000000;
        return {
          id: model.id,
          name: model.name || model.id.split("/").pop() || model.id,
          provider: model.id.split("/")[0] || "unknown",
          description: model.description || "",
          category: "text" as const,
          pricing: {
            prompt: parseFloat(model.pricing?.prompt || "0") * 1000000,
            completion: outputPrice,
          },
          contextLength: model.context_length || 0,
          tags: getTags(eloEntry, outputPrice),
          popularity: calculatePopularity(eloEntry, outputPrice),
          arenaElo: eloEntry?.score ?? null,
          modelUrl: eloEntry?.url || undefined,
          updatedAt: new Date().toISOString(),
          capabilities: [],
        };
      })
      .sort((a: TextModel, b: TextModel) => b.popularity - a.popularity);
  } catch (error) {
    console.error("Failed to fetch OpenRouter models:", error);
    return [];
  }
}
