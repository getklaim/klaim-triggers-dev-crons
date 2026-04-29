export interface ArenaEntry {
  score: number;
  url: string;
}

/**
 * Normalize a model name for fuzzy matching against Arena leaderboard keys.
 * Lowercases, strips separators, removes date suffixes and trailing token counts.
 */
export function normalizeModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_\s]/g, "")
    .replace(/20\d{6}/g, "")
    .replace(/\d+k$/g, "");
}

/**
 * Fetch Arena leaderboard scores for a given category.
 * @param category - one of "text", "text-to-image", "text-to-video"
 * @returns Map from normalized model name to { score, url }. Empty map on failure.
 */
export async function fetchArenaScores(
  category: string,
): Promise<Map<string, ArenaEntry>> {
  const arenaMap = new Map<string, ArenaEntry>();

  try {
    const response = await fetch(
      `https://arena.ai/leaderboard/${category}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      },
    );

    if (!response.ok) {
      console.warn(
        `Arena ${category} leaderboard not available (status ${response.status})`,
      );
      return arenaMap;
    }

    const html = await response.text();

    const rowPattern =
      /href="(https?:\/\/[^"]+)"[^>]*title="([^"]+)">\s*<span class="max-w-full truncate">[^<]+<\/span>[\s\S]*?<span class="text-sm">(\d{3,4})<\/span>/g;

    let match;
    while ((match = rowPattern.exec(html)) !== null) {
      const url = match[1];
      const name = match[2];
      const score = parseInt(match[3], 10);
      if (name && score > 800 && score < 2000) {
        const normalizedKey = normalizeModelName(name);
        if (!arenaMap.has(normalizedKey)) {
          arenaMap.set(normalizedKey, { score, url });
        }
      }
    }

    console.log(
      `Fetched ${arenaMap.size} models from Arena ${category} leaderboard`,
    );
    return arenaMap;
  } catch (error) {
    console.warn(`Failed to fetch Arena ${category} leaderboard:`, error);
    return arenaMap;
  }
}

/**
 * Find an Arena score entry for a given model name using exact then fuzzy matching.
 * Mirrors the same logic used for text models in openrouter.ts.
 */
export function findArenaScore(
  modelName: string,
  arenaMap: Map<string, ArenaEntry>,
): ArenaEntry | null {
  const name = modelName.split("/").pop() || modelName;
  const normalized = normalizeModelName(name);

  if (arenaMap.has(normalized)) {
    return arenaMap.get(normalized)!;
  }

  const withoutDots = normalized.replace(/\./g, "");
  if (arenaMap.has(withoutDots)) {
    return arenaMap.get(withoutDots)!;
  }

  let bestMatch: { score: number; url: string; keyLen: number } | null = null;
  for (const [key, entry] of arenaMap) {
    if (key.length < 5) continue;
    if (normalized === key || withoutDots === key) {
      return entry;
    }
    if (normalized.includes(key) || key.includes(normalized)) {
      if (!bestMatch || key.length > bestMatch.keyLen) {
        bestMatch = { score: entry.score, url: entry.url, keyLen: key.length };
      }
    }
  }

  return bestMatch ? { score: bestMatch.score, url: bestMatch.url } : null;
}
