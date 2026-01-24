import { schedules } from "@trigger.dev/sdk/v3";
import { prisma } from "../lib/db.js";
import { fetchOpenRouterModels } from "../lib/api/openrouter.js";
import {
  fetchReplicateImageModels,
  fetchReplicateVideoModels,
  fetchReplicateAudioModels,
} from "../lib/api/replicate.js";
import { getBenchmark } from "../lib/data/benchmarks.js";

interface TextModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  pricing: { prompt: number; completion: number };
  contextLength: number;
  tags: string[];
  popularity: number;
}

interface ImageModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  pricing: { perImage?: number; perSecond?: number };
  supportedSizes?: string[];
  style?: string[];
  qualityScore?: number;
  speedScore?: number;
  maxResolution?: string;
  supportsInpainting?: boolean;
  supportsOutpainting?: boolean;
  supportsControlNet?: boolean;
  runCount?: number;
  tags: string[];
  popularity: number;
}

interface VideoModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  pricing: { perSecond?: number; perVideo?: number };
  maxDuration?: number;
  resolution?: string[];
  qualityScore?: number;
  motionScore?: number;
  fps?: number;
  supportsAudio?: boolean;
  supportsTextToVideo?: boolean;
  supportsImageToVideo?: boolean;
  runCount?: number;
  tags: string[];
  popularity: number;
}

interface AudioModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  type: string;
  pricing: { perMinute?: number; perCharacter?: number; perSecond?: number; perOutput?: number };
  languages?: string[];
  qualityScore?: number;
  naturalness?: number;
  accuracy?: number;
  voiceCloning?: boolean;
  emotionControl?: boolean;
  realtime?: boolean;
  runCount?: number;
  tags: string[];
  popularity: number;
}

export const syncAIModels = schedules.task({
  id: "sync-ai-models",
  cron: "0 0 * * *",
  run: async () => {
    const startTime = Date.now();
    console.log("Starting AI models sync...");

    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) {
      console.error("REPLICATE_API_TOKEN not configured");
      await prisma.syncLog.create({
        data: {
          syncType: "full",
          status: "failed",
          errorMessage: "REPLICATE_API_TOKEN not configured",
          duration: Date.now() - startTime,
        },
      });
      return { success: false, error: "REPLICATE_API_TOKEN not configured" };
    }

    try {
      console.log("Fetching models from APIs...");
      const [textModels, imageModels, videoModels, audioModels] = await Promise.all([
        fetchOpenRouterModels(),
        fetchReplicateImageModels(replicateToken),
        fetchReplicateVideoModels(replicateToken),
        fetchReplicateAudioModels(replicateToken),
      ]);

      console.log(`Fetched: ${textModels.length} text, ${imageModels.length} image, ${videoModels.length} video, ${audioModels.length} audio models`);

      console.log("Saving text models...");
      await saveTextModels(textModels);

      console.log("Saving image models...");
      await saveImageModels(imageModels);

      console.log("Saving video models...");
      await saveVideoModels(videoModels);

      console.log("Saving audio models...");
      await saveAudioModels(audioModels);

      // Soft delete models that are no longer in API
      console.log("Checking for deleted models...");
      const allApiModelIds = [
        ...textModels.map(m => m.id),
        ...imageModels.map(m => m.id),
        ...videoModels.map(m => m.id),
        ...audioModels.map(m => m.id),
      ];
      await softDeleteRemovedModels(allApiModelIds);

      const totalCount = textModels.length + imageModels.length + videoModels.length + audioModels.length;
      const duration = Date.now() - startTime;

      await prisma.syncLog.create({
        data: {
          syncType: "full",
          status: "success",
          modelCount: totalCount,
          duration,
        },
      });

      console.log(`Sync completed in ${duration}ms`);

      return {
        success: true,
        counts: {
          text: textModels.length,
          image: imageModels.length,
          video: videoModels.length,
          audio: audioModels.length,
          total: totalCount,
        },
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await prisma.syncLog.create({
        data: {
          syncType: "full",
          status: "failed",
          errorMessage,
          duration,
        },
      });

      console.error("Sync failed:", errorMessage);
      throw error;
    }
  },
});

async function saveTextModels(models: TextModel[]) {
  for (const model of models) {
    const benchmark = getBenchmark(model.id);

    const savedModel = await prisma.aiModel.upsert({
      where: { modelId: model.id },
      update: {
        name: model.name,
        description: model.description,
        contextLength: model.contextLength,
        tags: model.tags,
        popularity: model.popularity,
        mmlu: benchmark?.mmlu,
        gpqa: benchmark?.gpqa,
        humanEval: benchmark?.humanEval,
        sweBench: benchmark?.sweBench,
        liveCodeBench: benchmark?.liveCodeBench,
        math: benchmark?.math,
        speed: benchmark?.speed,
        latency: benchmark?.latency,
        arenaElo: benchmark?.arenaElo,
      },
      create: {
        modelId: model.id,
        type: "TEXT",
        name: model.name,
        description: model.description,
        contextLength: model.contextLength,
        tags: model.tags,
        popularity: model.popularity,
        mmlu: benchmark?.mmlu,
        gpqa: benchmark?.gpqa,
        humanEval: benchmark?.humanEval,
        sweBench: benchmark?.sweBench,
        liveCodeBench: benchmark?.liveCodeBench,
        math: benchmark?.math,
        speed: benchmark?.speed,
        latency: benchmark?.latency,
        arenaElo: benchmark?.arenaElo,
      },
    });

    await prisma.aiPrice.upsert({
      where: { modelId: savedModel.id },
      update: {
        inputPrice: model.pricing.prompt,
        outputPrice: model.pricing.completion,
      },
      create: {
        modelId: savedModel.id,
        inputPrice: model.pricing.prompt,
        outputPrice: model.pricing.completion,
      },
    });
  }
}

async function saveImageModels(models: ImageModel[]) {
  for (const model of models) {
    const savedModel = await prisma.aiModel.upsert({
      where: { modelId: model.id },
      update: {
        name: model.name,
        description: model.description,
        supportedSizes: model.supportedSizes,
        styles: model.style,
        qualityScore: model.qualityScore,
        speedScore: model.speedScore,
        maxResolution: model.maxResolution,
        supportsInpainting: model.supportsInpainting,
        supportsOutpainting: model.supportsOutpainting,
        supportsControlNet: model.supportsControlNet,
        runCount: model.runCount,
        tags: model.tags,
        popularity: model.popularity,
      },
      create: {
        modelId: model.id,
        type: "IMAGE",
        name: model.name,
        description: model.description,
        supportedSizes: model.supportedSizes,
        styles: model.style,
        qualityScore: model.qualityScore,
        speedScore: model.speedScore,
        maxResolution: model.maxResolution,
        supportsInpainting: model.supportsInpainting,
        supportsOutpainting: model.supportsOutpainting,
        supportsControlNet: model.supportsControlNet,
        runCount: model.runCount,
        tags: model.tags,
        popularity: model.popularity,
      },
    });

    await prisma.aiPrice.upsert({
      where: { modelId: savedModel.id },
      update: {
        pricePerImage: model.pricing.perImage,
        pricePerSecond: model.pricing.perSecond,
      },
      create: {
        modelId: savedModel.id,
        pricePerImage: model.pricing.perImage,
        pricePerSecond: model.pricing.perSecond,
      },
    });
  }
}

async function saveVideoModels(models: VideoModel[]) {
  for (const model of models) {
    const savedModel = await prisma.aiModel.upsert({
      where: { modelId: model.id },
      update: {
        name: model.name,
        description: model.description,
        maxDuration: model.maxDuration,
        resolution: model.resolution,
        qualityScore: model.qualityScore,
        motionScore: model.motionScore,
        fps: model.fps,
        supportsAudio: model.supportsAudio,
        supportsTextToVideo: model.supportsTextToVideo,
        supportsImageToVideo: model.supportsImageToVideo,
        runCount: model.runCount,
        tags: model.tags,
        popularity: model.popularity,
      },
      create: {
        modelId: model.id,
        type: "VIDEO",
        name: model.name,
        description: model.description,
        maxDuration: model.maxDuration,
        resolution: model.resolution,
        qualityScore: model.qualityScore,
        motionScore: model.motionScore,
        fps: model.fps,
        supportsAudio: model.supportsAudio,
        supportsTextToVideo: model.supportsTextToVideo,
        supportsImageToVideo: model.supportsImageToVideo,
        runCount: model.runCount,
        tags: model.tags,
        popularity: model.popularity,
      },
    });

    await prisma.aiPrice.upsert({
      where: { modelId: savedModel.id },
      update: {
        pricePerSecond: model.pricing.perSecond ?? null,
        pricePerVideo: model.pricing.perVideo ?? null,
      },
      create: {
        modelId: savedModel.id,
        pricePerSecond: model.pricing.perSecond ?? null,
        pricePerVideo: model.pricing.perVideo ?? null,
      },
    });
  }
}

async function saveAudioModels(models: AudioModel[]) {
  for (const model of models) {
    if (model.pricing.perOutput !== undefined) {
      console.log(`[SaveAudio] ${model.id}: perOutput=${model.pricing.perOutput}, perSecond=${model.pricing.perSecond}`);
    }
    const savedModel = await prisma.aiModel.upsert({
      where: { modelId: model.id },
      update: {
        name: model.name,
        description: model.description,
        audioType: model.type,
        languages: model.languages,
        qualityScore: model.qualityScore,
        naturalness: model.naturalness,
        accuracy: model.accuracy,
        voiceCloning: model.voiceCloning,
        emotionControl: model.emotionControl,
        realtime: model.realtime,
        runCount: model.runCount,
        tags: model.tags,
        popularity: model.popularity,
      },
      create: {
        modelId: model.id,
        type: "AUDIO",
        name: model.name,
        description: model.description,
        audioType: model.type,
        languages: model.languages,
        qualityScore: model.qualityScore,
        naturalness: model.naturalness,
        accuracy: model.accuracy,
        voiceCloning: model.voiceCloning,
        emotionControl: model.emotionControl,
        realtime: model.realtime,
        runCount: model.runCount,
        tags: model.tags,
        popularity: model.popularity,
      },
    });

    await prisma.aiPrice.upsert({
      where: { modelId: savedModel.id },
      update: {
        pricePerMinute: model.pricing.perMinute ?? null,
        pricePerChar: model.pricing.perCharacter ?? null,
        pricePerSecond: model.pricing.perSecond ?? null,
        pricePerOutput: model.pricing.perOutput ?? null,
      },
      create: {
        modelId: savedModel.id,
        pricePerMinute: model.pricing.perMinute ?? null,
        pricePerChar: model.pricing.perCharacter ?? null,
        pricePerSecond: model.pricing.perSecond ?? null,
        pricePerOutput: model.pricing.perOutput ?? null,
      },
    });
  }
}

async function softDeleteRemovedModels(apiModelIds: string[]) {
  // Find models in DB that are not in API (and not already deleted)
  const dbModels = await prisma.aiModel.findMany({
    where: { deletedAt: null },
    select: { id: true, modelId: true },
  });

  const apiModelIdSet = new Set(apiModelIds);
  const modelsToDelete = dbModels.filter(m => !apiModelIdSet.has(m.modelId));

  if (modelsToDelete.length > 0) {
    console.log(`Soft deleting ${modelsToDelete.length} models no longer in API`);

    await prisma.aiModel.updateMany({
      where: {
        id: { in: modelsToDelete.map(m => m.id) },
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  // Restore models that reappeared in API
  const deletedModels = await prisma.aiModel.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true, modelId: true },
  });

  const modelsToRestore = deletedModels.filter(m => apiModelIdSet.has(m.modelId));

  if (modelsToRestore.length > 0) {
    console.log(`Restoring ${modelsToRestore.length} models that reappeared in API`);

    await prisma.aiModel.updateMany({
      where: {
        id: { in: modelsToRestore.map(m => m.id) },
      },
      data: {
        deletedAt: null,
      },
    });
  }
}