# Suggestion: Extract Arena Leaderboard Parser into arena-parser.ts

## Problem

`src/lib/api/openrouter.ts` mixes two distinct concerns:
1. OpenRouter REST API fetching and price normalization (stable)
2. Arena leaderboard HTML scraping with a regex that must change whenever arena.ai/leaderboard restructures its HTML (volatile)

The HTML scraping logic has already been patched at least twice in recorded sessions:
- Regex changed from href-based to title-attribute-based in session 54fecdfa
- Each fix required manually downloading /tmp/arena.html, running multiple `node -e` one-liners to probe the structure, then editing openrouter.ts

The file currently contains 267 lines. The Arena-specific surface area accounts for roughly 145 of those lines (functions: `fetchArenaLeaderboard`, `normalizeModelName`, `findEloScore`, `getFallbackEloData`, `calculatePopularityFromElo`), leaving the OpenRouter-specific logic at ~120 lines.

## Evidence

- Session 54fecdfa: 2 Bash calls reading /tmp/arena.html with different regexes before arriving at the title-attribute pattern, then 1 Edit to openrouter.ts, then a build+commit pipeline — 4 tool calls just to patch a single regex.
- The fallback ELO table in `getFallbackEloData()` (lines 100–155) is 47 entries of manually maintained data that will drift from reality over time.
- Cross-session observation: the Arena scraping concern has caused repeated edits to this file while the OpenRouter API fetch logic has not changed.

## Proposed Change

Create `src/lib/api/arena-parser.ts` and move the following into it:

- `fetchArenaLeaderboard(): Promise<Map<string, number>>`
- `normalizeModelName(name: string): string`
- `findEloScore(modelId: string, eloMap: Map<string, number>): number | null`
- `getFallbackEloData(): Map<string, number>`
- `calculatePopularityFromElo(elo: number | null): number`

`openrouter.ts` retains only:
- OpenRouter interfaces and `fetchOpenRouterModels()`
- `calculatePopularityFromPrice()`, `calculatePopularity()`, `getTags()`, `isImageOrVisionModel()`

The import in `openrouter.ts` becomes:
```ts
import { fetchArenaLeaderboard, findEloScore } from './arena-parser.js';
```

## Benefits

- Next time arena.ai restructures its HTML, only `arena-parser.ts` needs to be read and edited — no need to visually scan through OpenRouter API logic to find the regex.
- The /tmp/arena.html test loop stays contained to a single-concern file.
- `getFallbackEloData()` and `normalizeModelName()` become independently testable without importing OpenRouter concerns.
- File sizes drop to ~120 lines each, both under a comfortable single-screen threshold.

## Effort Estimate

Low. Pure move — no logic changes required. The extraction boundary is clean (no shared mutable state between the two concerns).
