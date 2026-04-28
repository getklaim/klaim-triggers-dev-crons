# Suggestion: Add Per-Model Error Isolation to Prevent Full-Sync Failures

## Issue

The four `save*Models` functions and the three Replicate collection fetchers have no per-model error boundary. A single Prisma constraint violation or a single unexpected HTML structure in a price fetch will bubble up through the `try/catch` in `syncAIModels` and abort the entire sync, writing a `failed` status to `syncLog` even if 99% of models were processed successfully.

## Quantified evidence

- `saveTextModels` (lines 195-250): `for` loop with no `try/catch` around the per-model `upsert` calls. A unique constraint violation on any of the ~200+ text models throws immediately.
- `saveImageModels` (lines 252-303), `saveVideoModels` (lines 305-356), `saveAudioModels` (lines 358-416): same pattern.
- `fetchReplicateImageModels` (lines 368-423): the per-model `fetchPriceFromWebPage` call is inside a `for` loop with no per-model catch. `fetchPriceFromWebPage` can return `undefined` on network error (line 230, the outer `catch` returns `undefined`), and the caller at line 395 only checks for `'not_found'` — it silently pushes `{ pricing: { perImage: undefined } }` into the array. Prisma then receives `undefined` where a number is expected.
- `fetchReplicateAudioModels` (lines 483-576): STT and TTS loops both call `fetchAudioPriceFromWebPage` with no per-model isolation.

The top-level `catch` in `syncAIModels` (line 177) logs the error and re-throws, meaning the calling Trigger.dev task sees a hard failure and may retry the entire sync.

## Proposed fix

Wrap each per-model operation in its own `try/catch` that:
1. Logs a structured warning with `{ modelId, error }` fields.
2. Pushes the model to a `failedModels` array.
3. Continues the loop rather than throwing.

At the end of the sync, report `failedModels.length` in the `syncLog` as a new `failedCount` field so failures are visible without aborting the job.

```typescript
const failedModels: string[] = [];
for (const model of models) {
  try {
    await prisma.aiModel.upsert(...);
    await prisma.aiPrice.upsert(...);
  } catch (err) {
    console.warn(`[saveTextModels] Failed to save ${model.id}:`, err);
    failedModels.push(model.id);
  }
}
return failedModels;
```

## Files affected

- `src/trigger/sync-models.ts` — all four `save*Models` functions (lines 195-416) and `syncAIModels` top-level catch (line 177)
- `src/lib/api/replicate.ts` — per-model price fetch loops (lines 392-415, 450-480, 505-534, 537-568)
