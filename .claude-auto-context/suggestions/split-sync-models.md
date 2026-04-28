# Suggestion: Split sync-models.ts into focused modules

## Evidence

- `src/trigger/sync-models.ts` is 461 lines containing 6 distinct logical units:
  - 4 local interface definitions (TextModel, ImageModel, VideoModel, AudioModel) — lines 11-77
  - 1 orchestrator function `syncAIModels` — lines 79-193
  - 4 save functions (`saveTextModels`, `saveImageModels`, `saveVideoModels`, `saveAudioModels`) — lines 195-416
  - 1 soft-delete/restore function `softDeleteRemovedModels` — lines 418-461
- The session agent read the file with `offset=420, limit=50`, confirming the file required section-by-section navigation.
- `src/lib/types/models.ts` already exists and exports `TextModel`, `ImageModel`, `VideoModel`, `AudioModel` interfaces — but `sync-models.ts` defines its own parallel set of the same four interfaces locally (lines 11-77), creating a type duplication.

## Duplication detail

`src/lib/types/models.ts` exports `TextModel`, `ImageModel`, `VideoModel`, `AudioModel` with a `category` discriminant field and `updatedAt` field.
`sync-models.ts` re-declares the same four interfaces without those fields and without importing from the types file.
These are structurally divergent definitions of the same domain objects — one set will drift over time.

## Proposed split

```
src/trigger/sync-models.ts          (keep: orchestrator only, ~50 lines)
src/lib/db/save-text-models.ts      (new: saveTextModels, ~55 lines)
src/lib/db/save-image-models.ts     (new: saveImageModels, ~55 lines)
src/lib/db/save-video-models.ts     (new: saveVideoModels, ~55 lines)
src/lib/db/save-audio-models.ts     (new: saveAudioModels, ~60 lines)
src/lib/db/soft-delete-models.ts    (new: softDeleteRemovedModels, ~45 lines)
```

Each save file imports its interface from `src/lib/types/models.ts` (resolving the duplication) and imports `prisma` from `src/lib/db.ts`.

## Priority

Medium. The file is functional, but the type duplication is an active correctness risk — if `TextModel.pricing` fields diverge between the two definitions, TypeScript will silently accept whichever the local file uses. The split also makes individual save functions independently testable.
