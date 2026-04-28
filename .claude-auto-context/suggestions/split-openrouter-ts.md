# Suggestion: Split `openrouter.ts` into three focused modules

**File:** `src/lib/api/openrouter.ts`
**Current size:** 278 lines (after 18-line cleanup in session 54fecdfa)
**Priority:** Medium

## Evidence

`openrouter.ts` currently contains three distinct, independently testable concerns packed into one file:

| Concern | Lines | Functions |
|---|---|---|
| OpenRouter API fetch + model mapping | ~50 | `fetchOpenRouterModels` (public export), `isImageOrVisionModel` |
| Arena ELO scraping + fallback data | ~145 | `fetchArenaLeaderboard`, `getFallbackEloData`, `normalizeModelName`, `findEloScore` |
| Popularity/tag scoring logic | ~30 | `calculatePopularityFromElo`, `calculatePopularityFromPrice`, `calculatePopularity`, `getTags` |

The Arena ELO scraper alone (lines 22–166) accounts for ~55% of the file. It includes:
- A live HTTP scrape of `arena.ai/leaderboard` with regex parsing
- Two fallback regex patterns
- 40+ hardcoded ELO entries in `getFallbackEloData`

These three concerns change for different reasons: the API fetch changes when OpenRouter's response schema changes; the ELO scraper changes when arena.ai changes its HTML structure; the scoring logic changes when the popularity formula is tuned.

A previous session traced one feature (AI model sorting/popularity display) across 3 repos and 28+ tool calls. Keeping all three concerns co-located in one file makes partial reads (like the `offset: 25, limit: 15` read in session 54fecdfa) the norm rather than the exception.

## Recommended split

```
src/lib/api/
  openrouter.ts          # only: fetchOpenRouterModels(), isImageOrVisionModel()
  arena-elo.ts           # only: fetchArenaLeaderboard(), getFallbackEloData(),
                         #       normalizeModelName(), findEloScore()
  model-scoring.ts       # only: calculatePopularityFromElo(), calculatePopularityFromPrice(),
                         #       calculatePopularity(), getTags()
```

`openrouter.ts` imports from `arena-elo.ts` and `model-scoring.ts`; `sync-models.ts` import surface stays identical (`fetchOpenRouterModels` from `openrouter.ts`).

## What this fixes

- Each file becomes ~50–100 lines and single-purpose — full reads, no offsets needed
- `arena-elo.ts` can be updated or replaced (e.g., switch to a different leaderboard source) without touching API fetch code
- `getFallbackEloData` (40+ hardcoded entries, likely to grow) is isolated; it could later be promoted to `src/lib/data/arena-elo-fallback.ts` matching the existing `src/lib/data/` convention
- No changes needed to `sync-models.ts` or any caller

## Note on `getFallbackEloData`

The 40-entry hardcoded ELO map at lines 111–166 is the most volatile part of the file. Long-term it may be worth moving it to `src/lib/data/` (alongside `benchmarks.ts`) so it is clearly static data rather than scraping logic. This is a separate, optional step.
