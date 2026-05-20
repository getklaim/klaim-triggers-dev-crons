type MediaType = "image" | "video" | "audio";

interface MediaScoreInput {
  id: string;
  name: string;
  provider?: string;
  category?: string;
  audioType?: string;
  arenaScore?: number | null;
  rankIndex?: number;
  totalCount?: number;
}

interface ScorePrior {
  pattern: RegExp;
  score: number;
}

const IMAGE_PRIORS: ScorePrior[] = [
  { pattern: /\bgpt[-\s]?image|openai/i, score: 1240 },
  { pattern: /\bgemini|nano[-\s]?banana|imagen/i, score: 1230 },
  { pattern: /\bgrok[-\s]?imagine|xai|x-ai/i, score: 1190 },
  { pattern: /\bflux[-\s]?2|black[-\s]?forest|bfl/i, score: 1165 },
  { pattern: /\bseedream|bytedance/i, score: 1140 },
  { pattern: /\bqwen[-\s]?image/i, score: 1130 },
  { pattern: /\bmidjourney/i, score: 1125 },
  { pattern: /\brecraft/i, score: 1110 },
  { pattern: /\bideogram/i, score: 1050 },
  { pattern: /\bstable[-\s]?diffusion|stability/i, score: 940 },
];

const VIDEO_PRIORS: ScorePrior[] = [
  { pattern: /\bveo|google/i, score: 1240 },
  { pattern: /\bsora|openai/i, score: 1220 },
  { pattern: /\brunway|gen[-\s]?4/i, score: 1180 },
  { pattern: /\bkling|kuaishou/i, score: 1160 },
  { pattern: /\bluma|ray/i, score: 1150 },
  { pattern: /\bseedance|bytedance/i, score: 1140 },
  { pattern: /\bpika/i, score: 1110 },
  { pattern: /\bwan|alibaba|qwen/i, score: 1100 },
  { pattern: /\bminimax|hailuo/i, score: 1090 },
  { pattern: /\bmochi/i, score: 980 },
];

const AUDIO_PRIORS: ScorePrior[] = [
  { pattern: /\belevenlabs.*multilingual|multilingual.*elevenlabs/i, score: 1180 },
  { pattern: /\belevenlabs.*flash|elevenlabs.*turbo|flash.*turbo/i, score: 1130 },
  { pattern: /\belevenlabs.*scribe|scribe/i, score: 1160 },
  { pattern: /\belevenlabs.*music|elevenlabs.*sound/i, score: 1100 },
  { pattern: /\bwhisper|openai/i, score: 1140 },
  { pattern: /\bstable[-\s]?audio|stability/i, score: 1080 },
  { pattern: /\bmmaudio|minimax|speech/i, score: 1060 },
  { pattern: /\bvoice|tts|text[-\s]?to[-\s]?speech/i, score: 1040 },
  { pattern: /\bmusic|song|audio/i, score: 1020 },
];

function clamp(score: number): number {
  return Math.max(850, Math.min(1300, Math.round(score)));
}

function rankFallbackScore(
  type: MediaType,
  rankIndex: number | undefined,
  totalCount: number | undefined,
): number {
  const index = rankIndex ?? 0;
  const total = Math.max(totalCount ?? 1, 1);
  const percentile = 1 - index / Math.max(total - 1, 1);

  if (type === "image") return clamp(920 + percentile * 150);
  if (type === "video") return clamp(900 + percentile * 160);
  return clamp(880 + percentile * 150);
}

function priorScore(priors: ScorePrior[], input: MediaScoreInput): number | null {
  const searchText = [
    input.id,
    input.name,
    input.provider,
    input.category,
    input.audioType,
  ]
    .filter(Boolean)
    .join(" ");

  for (const prior of priors) {
    if (prior.pattern.test(searchText)) return prior.score;
  }

  return null;
}

function resolveMediaQualityScore(
  type: MediaType,
  priors: ScorePrior[],
  input: MediaScoreInput,
): number {
  if (input.arenaScore !== null && input.arenaScore !== undefined) {
    return clamp(input.arenaScore);
  }

  const prior = priorScore(priors, input);
  const fallback = rankFallbackScore(type, input.rankIndex, input.totalCount);

  if (prior === null) return fallback;

  // Blend known model/lab priors with source ordering so famous models rank well
  // without making every non-Arena score look as strong as measured Arena data.
  return clamp(prior * 0.75 + fallback * 0.25);
}

export function resolveImageQualityScore(input: MediaScoreInput): number {
  return resolveMediaQualityScore("image", IMAGE_PRIORS, input);
}

export function resolveVideoQualityScore(input: MediaScoreInput): number {
  return resolveMediaQualityScore("video", VIDEO_PRIORS, input);
}

export function resolveAudioQualityScore(input: MediaScoreInput): number {
  return resolveMediaQualityScore("audio", AUDIO_PRIORS, input);
}

export function scoreToPopularity(score: number): number {
  return Math.max(0, Math.min(100, Math.floor((score - 850) / 4)));
}
