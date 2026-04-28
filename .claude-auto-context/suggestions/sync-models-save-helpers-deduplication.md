# Suggestion: Deduplicate save*Models helpers in sync-models.ts

## Signal source
Session 54fecdfa — partial read of sync-models.ts (offset 105, limit 10) to inspect
externalAudioModels usage, followed by full file analysis.

## Evidence

`src/trigger/sync-models.ts` is 461 lines. The line count is not itself the problem — the
file has one clear orchestrator function and five helpers, which is reasonable scope for a
single trigger. The structural issue is that the four `save*Models()` helpers
(lines 195-416, ~220 lines total) repeat the same two-query Prisma pattern:

```
prisma.aiModel.upsert({ where: { modelId }, update: {...}, create: { type: "X", ... } })
prisma.aiPrice.upsert({ where: { modelId: savedModel.id }, update: {...}, create: { modelId: savedModel.id, ... } })
```

Each helper is 50-55 lines and differs only in:
- The model `type` literal ("TEXT", "IMAGE", "VIDEO", "AUDIO")
- Which fields go into the `aiModel` upsert (model-specific attributes)
- Which price fields go into the `aiPrice` upsert (perImage vs perSecond vs perMinute etc.)

Current duplication: 4 helpers x ~55 lines = ~220 lines for what is structurally the same
operation. If a new field is added to `aiModel` or `aiPrice`, it must be updated in 4 places.

## What to do

Extract two generic helpers:

```ts
async function upsertModel(modelId: string, type: ModelType, fields: Partial<AiModelFields>) {
  return prisma.aiModel.upsert({
    where: { modelId },
    update: fields,
    create: { modelId, type, ...fields },
  });
}

async function upsertPrice(modelDbId: string, pricing: Partial<AiPriceFields>) {
  return prisma.aiPrice.upsert({
    where: { modelId: modelDbId },
    update: pricing,
    create: { modelId: modelDbId, ...pricing },
  });
}
```

Then each `save*Models()` becomes a thin loop that maps model-specific fields and calls
these two helpers. Estimated result: ~220 lines reduced to ~80 lines (4 loops + 2 shared
helpers), net reduction ~140 lines, file drops from 461 to ~320 lines.

## What NOT to do

- Do not split sync-models.ts into multiple files. The orchestrator + helpers design is
  coherent and the file is not oversized once duplication is removed.
- Do not restructure src/lib/data/. It contains exactly two static-data modules
  (benchmarks.ts, external-audio.ts), both correctly placed and appropriately named.
  No reorganization warranted.

## Priority

Medium. The current code works correctly. The risk is maintenance drift: when a new
audio-model field (e.g., `accuracy`) was already present in the AudioModel interface
(line 70) but the `saveAudioModels` update block does not include it (lines 365-378),
suggesting the pattern has already diverged once. Deduplication prevents future omissions.

## Files affected

- `src/trigger/sync-models.ts` (lines 195-416 — the four save helpers)
- Optionally extract shared types to `src/lib/types/models.ts` if AiModelFields /
  AiPriceFields types don't already exist there
