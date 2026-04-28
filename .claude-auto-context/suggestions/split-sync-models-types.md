# Suggestion: Remove duplicate type definitions from sync-models.ts

**Priority:** Medium
**File:** `src/trigger/sync-models.ts`
**Related file:** `src/lib/types/models.ts`

## Evidence

`sync-models.ts` (461 lines) declares 4 interfaces at lines 11–78:
- `TextModel` (lines 11–21)
- `ImageModel` (lines 23–40)
- `VideoModel` (lines 42–59)
- `AudioModel` (lines 61–78)

`src/lib/types/models.ts` already exports identically-named interfaces `TextModel` (line 103), `ImageModel` (line 121), `VideoModel` (line 145), `AudioModel` (line 169) — with *more* fields (adds `category`, `updatedAt`, `capabilities`).

The local interfaces in `sync-models.ts` are a subset re-definition that diverges from the canonical types. `openrouter.ts` (line 1) already imports `TextModel` from `../types/models.js`, but `sync-models.ts` ignores that file and re-declares its own narrower versions. This means:

- `arenaElo` was added to the local `TextModel` in `sync-models.ts` (the edit in this session) but the canonical `TextModel` in `models.ts` already had `arenaElo` at line 116.
- The same field exists in two places; a future change to one will silently diverge from the other.

## Quantified duplication

| Location | Lines | Fields defined |
|---|---|---|
| `sync-models.ts` local `TextModel` | 11–21 (11 lines) | 8 fields |
| `models.ts` exported `TextModel` | 103–119 (17 lines) | 12 fields (superset) |
| `sync-models.ts` local `ImageModel` | 23–40 (18 lines) | 13 fields |
| `models.ts` exported `ImageModel` | 121–143 (23 lines) | 15 fields (superset) |
| `sync-models.ts` local `VideoModel` | 42–59 (18 lines) | 13 fields |
| `models.ts` exported `VideoModel` | 145–167 (23 lines) | 14 fields (superset) |
| `sync-models.ts` local `AudioModel` | 61–78 (18 lines) | 14 fields |
| `models.ts` exported `AudioModel` | 169–193 (25 lines) | 15 fields (superset) |

Removing the 4 local interfaces (lines 11–78, 68 lines) and replacing with imports from `../lib/types/models.js` would:
- Reduce `sync-models.ts` from 461 to ~393 lines
- Eliminate the divergence risk entirely
- Make `sync-models.ts` consistent with `openrouter.ts`, which already uses the canonical types

## Note on Arena ELO logic placement

`fetchArenaLeaderboard`, `normalizeModelName`, `findEloScore`, `getFallbackEloData`, `calculatePopularityFromElo`, `calculatePopularityFromPrice`, `calculatePopularity`, `getTags` — all 8 Arena/popularity functions (lines 22–189 of `openrouter.ts`) live inside `openrouter.ts`. This is reasonable for now since they are only consumed by `fetchOpenRouterModels`. If Arena ELO scraping ever needs to be used independently or tested in isolation, extracting to `src/lib/api/arena.ts` would be a clean boundary. At current scope this is not urgent.

## Suggested action

1. Delete lines 11–78 from `sync-models.ts` (the 4 local interface declarations).
2. Add at the top of `sync-models.ts`:
   ```ts
   import type { TextModel, ImageModel, VideoModel, AudioModel } from "../lib/types/models.js";
   ```
3. Verify `npm run build` passes — no other changes needed since the local interfaces are structurally compatible subsets of the exported ones.
