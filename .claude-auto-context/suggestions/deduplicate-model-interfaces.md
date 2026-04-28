# Suggestion: Eliminate duplicate model interface definitions in sync-models.ts

## Problem

`TextModel`, `ImageModel`, `VideoModel`, and `AudioModel` are defined twice in the codebase:

1. `src/lib/types/models.ts` — the canonical shared types, exported and imported by both `openrouter.ts` and `replicate.ts`
2. `src/trigger/sync-models.ts` lines 11–78 — private inline versions used only by the save functions in that file

The two sets of definitions have diverged:

| Field | types/models.ts TextModel | sync-models.ts TextModel |
|-------|--------------------------|--------------------------|
| category | `'text'` (required) | absent |
| updatedAt | `string` (required) | absent |
| capabilities | `string[]` (required) | absent |
| arenaElo | `number \| null` (after recent edit) | `number \| null` (added in session) |

The `ImageModel` and `VideoModel` in sync-models.ts also lack `category` and `updatedAt` fields present in types/models.ts.

## Why this caused the 3-file change

When `arenaElo` was added:
1. `openrouter.ts` needed to fetch and map it — it imports `TextModel` from `types/models.ts`, so `types/models.ts` had to be updated
2. `sync-models.ts` has its own `TextModel` interface that does NOT import from `types/models.ts`, so it also needed an independent edit (offset 12, limit 10 read in the session confirms the targeted line edit)
3. The upsert blocks in `saveTextModels` needed the new field

If `sync-models.ts` had imported `TextModel` from `types/models.ts` instead of declaring its own, step 2 would have been zero-cost.

## Proposed fix

In `sync-models.ts`, replace lines 11–78 with:

```typescript
import type { TextModel, ImageModel, VideoModel, AudioModel } from '../lib/types/models.js';
```

The existing `types/models.ts` interfaces already contain every field needed by the save functions (all pricing, tags, popularity, arenaElo, etc.). The only fields in types/models.ts not used by the save functions (`category`, `updatedAt`, `capabilities`) are simply ignored — TypeScript structural typing means this is safe.

## Quantitative impact

- Removes 68 lines of duplicate interface code from sync-models.ts (lines 11–78)
- Future field additions cost 1 file edit (types/models.ts) + 1 upsert block edit (sync-models.ts), not 3 file edits
- Both `openrouter.ts` and `replicate.ts` already import from `types/models.ts` correctly — this aligns sync-models.ts with the established pattern
