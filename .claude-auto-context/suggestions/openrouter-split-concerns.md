# Suggestion: Split openrouter.ts into focused modules

## Source file
`src/lib/api/openrouter.ts` — 278 lines

## Evidence from session

- The file was read **twice at the same offset** (lines 39-63, the `fetchArenaLeaderboard` function body) in a single session, indicating a developer had to revisit the same region to understand or debug it independently of the OpenRouter logic.
- The original Arena API URL (`https://lmarena.ai/api/v1/arena/text/latest`) broke when the service migrated to `arena.ai` and began returning 403. The fix — HTML scraping via regex — was applied directly inside the same function, leaving no separation between "where to fetch data" and "how to parse it."
- The hardcoded fallback ELO table (44 entries, lines 112-159) is embedded inside a utility function, making it invisible to any caller that wants to inspect or update benchmarks without reading through fetch logic.

## Identified concerns mixed in one file

| Concern | Lines | Description |
|---|---|---|
| OpenRouter HTTP fetch + model mapping | 232-278 | `fetchOpenRouterModels` — the only public export |
| Arena leaderboard HTTP + HTML scraping | 22-76 | `fetchArenaLeaderboard` — private, but a distinct I/O boundary |
| Hardcoded fallback ELO data | 111-166 | `getFallbackEloData` — static data that changes independently of fetch logic |
| Model name normalization | 78-109 | `normalizeModelName` + `findEloScore` — pure string utilities |
| Popularity scoring | 168-200 | `calculatePopularityFromElo`, `calculatePopularityFromPrice`, `calculatePopularity` — pure math |
| Tag assignment | 196-200 | `getTags` — threshold logic that may need tuning separately |
| Image/vision filter | 202-230 | `isImageOrVisionModel` — keyword list that grows independently |

## Recommended split

```
src/lib/api/
  openrouter.ts          (keep — only fetchOpenRouterModels, 40-50 lines)
  arena-leaderboard.ts   (new — fetchArenaLeaderboard + HTML parsing logic)

src/lib/data/
  arena-fallback-elo.ts  (new — getFallbackEloData static record, no fetch)

src/lib/utils/
  model-scoring.ts       (new — normalizeModelName, findEloScore, calculatePopularity*, getTags, isImageOrVisionModel)
```

## Why each split matters

**`arena-leaderboard.ts`**
The Arena URL has already broken once (`lmarena.ai` → `arena.ai`, 403 response). Isolating it means the next URL change or scraping-pattern change is a one-file edit with zero risk to the OpenRouter fetch path. The two regex patterns (primary and fallback, lines 41 and 54) are fragile; they belong adjacent to each other in a dedicated module, not buried inside a 278-line API file.

**`arena-fallback-elo.ts`**
The 44-entry ELO table (lines 112-159) is static reference data. It currently lives inside `getFallbackEloData()` which is called from `fetchArenaLeaderboard`. Moving it to `src/lib/data/` puts it next to `benchmarks.ts`, which already holds a similar static record (`Record<string, BenchmarkData>`). A developer updating model scores can find both tables in the same directory. The two files are currently in different locations with no shared convention.

**`model-scoring.ts`**
`normalizeModelName` is a pure function with no I/O dependency. It is currently called from both `fetchArenaLeaderboard` (line 47, 60) and `findEloScore` (lines 91, 100). Extracting it to a utils module makes it independently testable and prevents it from being accidentally duplicated if `replicate.ts` ever needs similar normalization.

## Hardcoded external URLs — current state

| URL | Location | Status |
|---|---|---|
| `https://arena.ai/leaderboard` | `openrouter.ts` line 27 | Active (was `lmarena.ai`, broke with 403) |
| `https://openrouter.ai/api/v1/models` | `openrouter.ts` line 235 | Active |
| `https://replicate.com/{owner}/{name}` | `replicate.ts` lines 201, 237, 292 | Active (constructed inline, 3 separate fetch calls) |
| `https://api.replicate.com/v1/collections/text-to-image` | `replicate.ts` line 370 | Active |
| `https://api.replicate.com/v1/collections/text-to-video` | `replicate.ts` line 428 | Active |
| `https://api.replicate.com/v1/collections/speech-recognition` | `replicate.ts` line 486 | Active |
| `https://api.replicate.com/v1/collections/text-to-speech` | `replicate.ts` line 491 | Active |

None of these URLs are declared as named constants. Every URL change requires a grep-and-replace across logic functions. A `src/lib/config/api-urls.ts` (or equivalent) would make the Arena URL breakage from this session a one-line fix rather than a function-level edit.

## Suggested `api-urls.ts` shape

```typescript
// src/lib/config/api-urls.ts
export const API_URLS = {
  openRouter: {
    models: 'https://openrouter.ai/api/v1/models',
  },
  arena: {
    leaderboard: 'https://arena.ai/leaderboard',
  },
  replicate: {
    base: 'https://replicate.com',
    collections: {
      textToImage: 'https://api.replicate.com/v1/collections/text-to-image',
      textToVideo: 'https://api.replicate.com/v1/collections/text-to-video',
      speechRecognition: 'https://api.replicate.com/v1/collections/speech-recognition',
      textToSpeech: 'https://api.replicate.com/v1/collections/text-to-speech',
    },
  },
} as const;
```

## Priority

1. **High — extract Arena URL to constant** (one line, prevents repeat of the 403 incident)
2. **High — move `getFallbackEloData` to `src/lib/data/arena-fallback-elo.ts`** (co-locates it with `benchmarks.ts`)
3. **Medium — extract `arena-leaderboard.ts`** (isolates the fragile HTML scraping)
4. **Low — extract `model-scoring.ts`** (pure functions, low breakage risk but aids testability)
