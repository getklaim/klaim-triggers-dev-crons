# Suggestion: Split sync-models.ts into per-category trigger files

## Problem

`src/trigger/sync-models.ts` is 461 lines and handles all four model categories (TEXT, IMAGE, VIDEO, AUDIO) inside a single exported function `syncAIModels`. The file contains:

- 4 local interface definitions duplicating types already in `src/lib/types/models.ts` (TextModel, ImageModel, VideoModel, AudioModel — lines 11–78)
- 4 save functions: `saveTextModels` (lines 196–251, 56 lines), `saveImageModels` (lines 253–304, 52 lines), `saveVideoModels` (lines 306–357, 52 lines), `saveAudioModels` (lines 359–417, 59 lines)
- 1 shared utility: `softDeleteRemovedModels` (lines 419–461, 43 lines)
- 1 orchestrating function: `syncAIModels` (lines 80–194, 115 lines)

Each save function is structurally independent: it takes a typed array, iterates, and calls `prisma.aiModel.upsert` + `prisma.aiPrice.upsert` with model-type-specific fields. There is no shared state between them aside from the final ID list fed to `softDeleteRemovedModels`.

## Quantitative evidence

- Total file: 461 lines across 1 trigger entry point
- Interfaces in sync-models.ts are partial/different from the ones in types/models.ts (e.g., sync-models.ts `TextModel` has no `category`, `updatedAt`, `capabilities` fields that types/models.ts `TextModel` has — indicating drift between the two definitions)
- A single field addition (`arenaElo`) required edits across 3 files: `openrouter.ts` (fetched + mapped), `types/models.ts` (declared), and `sync-models.ts` (interface + upsert calls) — the save layer has no dedicated type file of its own
- `replicate.ts` is 577 lines and already exports 3 separate functions (`fetchReplicateImageModels`, `fetchReplicateVideoModels`, `fetchReplicateAudioModels`) — the fetch layer is already split by category, but the save layer is not

## Proposed structure

```
src/trigger/
  sync-text-models.ts    # imports fetchOpenRouterModels, saveTextModels, softDelete
  sync-image-models.ts   # imports fetchReplicateImageModels, saveImageModels
  sync-video-models.ts   # imports fetchReplicateVideoModels, saveVideoModels
  sync-audio-models.ts   # imports fetchReplicateAudioModels + getExternalAudioModels, saveAudioModels
  sync-models.ts         # thin orchestrator: calls all 4, collects IDs, calls softDelete
```

Move `saveTextModels`, `saveImageModels`, `saveVideoModels`, `saveAudioModels` into their respective trigger files (or into a new `src/lib/db/` layer if reuse is anticipated). Move `softDeleteRemovedModels` to `src/lib/db/sync-utils.ts`.

## Interface duplication to fix

The 4 local interfaces in sync-models.ts (lines 11–78) partially overlap with but diverge from `src/lib/types/models.ts`. The sync-layer interfaces should either:
- Import and reuse the types from `src/lib/types/models.ts` directly, or
- Be deleted and replaced with inline Prisma input types

Currently `TextModel` is defined twice with different shapes, which is the root cause of the 3-file change cost for `arenaElo`.

## Impact of not fixing

Every new model field (like `arenaElo` was) requires a minimum 3-file change: API file + types/models.ts + sync-models.ts interface + sync-models.ts upsert block (often 2 upsert blocks: update + create). At 461 lines this is manageable but the pattern compounds — adding another category (e.g., `code`, `embedding`) would push the file past 600 lines with the same structure.
