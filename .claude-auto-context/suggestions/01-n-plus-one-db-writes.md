# Suggestion: Eliminate N+1 DB Write Pattern in sync-models.ts

## Issue

Every `save*Models` function in `sync-models.ts` runs two sequential `prisma.upsert` calls inside a `for` loop: one for `aiModel` and one for `aiPrice`. With N models this produces 2N round-trips in series.

## Quantified evidence

- `saveTextModels` (lines 195-250): `for` loop → `aiModel.upsert` + `aiPrice.upsert` per model
- `saveImageModels` (lines 252-303): same pattern
- `saveVideoModels` (lines 305-356): same pattern
- `saveAudioModels` (lines 358-416): same pattern

OpenRouter currently returns ~200+ text models. Replicate `text-to-image` + `text-to-video` + `speech-recognition` + `text-to-speech` collections add tens more. At 2 DB round-trips per model, a single sync can issue **400+ sequential queries** just for upserts, all on the critical path of the Trigger.dev job.

## Proposed fix

Use Prisma's `$transaction` with a batched upsert strategy:

```typescript
// Collect all upsert args first, then execute in one transaction
await prisma.$transaction(
  models.map(model =>
    prisma.aiModel.upsert({ where: ..., update: ..., create: ... })
  )
);
```

For `aiPrice`, collect all `savedModel.id` values from the first batch and issue a second batched transaction rather than interleaving per-model. Alternatively, use `createMany` with `skipDuplicates: true` for the initial insert path and `updateMany` for the update path when the full set is known.

## Files affected

- `src/trigger/sync-models.ts` — all four `save*Models` functions (lines 195–416)
