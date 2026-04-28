# Suggestion: Consolidate Hardcoded Static Data into a Single data/ Layer

## Issue

Static reference data is spread across three separate source files with no shared ownership convention. When a model's pricing, benchmark scores, or ELO changes, updates must be tracked across multiple files with no cross-referencing.

## Quantified evidence

### benchmarks.ts (lines 10-65)
Contains a 55-entry `Record<string, BenchmarkData>` with up to 9 numeric fields per entry (mmlu, gpqa, humanEval, sweBench, liveCodeBench, math, speed, latency, arenaElo). These values are static snapshots with no fetch date or source URL annotation, making staleness invisible.

### external-audio.ts (lines 21-239)
Contains 11 hardcoded provider model objects for ElevenLabs (3), PlayHT (2), Amazon Polly (2), Google Cloud TTS (3), and Azure TTS (1). Each entry includes pricing (`perCharacter` ranging from `0.000004` to `0.00018`), capability flags, and `runCount` integers (e.g., `150000000`). The `updatedAt` field is always set to `new Date()` at call time (line 22), meaning the file gives no indication of when prices were last verified.

### openrouter.ts (lines 97-152)
Contains a 44-entry fallback ELO `Record<string, number>` (function `getFallbackEloData`, lines 97-152) used whenever the live Arena API call fails. These ELO values (ranging 1052-1490) overlap in key coverage with the `arenaElo` field already in `benchmarks.ts`, creating two independent sources of truth for the same score dimension.

**Overlap example**: `benchmarks.ts` has `'anthropic/claude-3.5-sonnet': { arenaElo: 1268 }` while `openrouter.ts` fallback has `'claude35sonnet': 1373` — different values, different keys, no reconciliation logic.

## Proposed fix

1. **Create `src/lib/data/static-models.ts`** as the single file for all hardcoded model data, with a top-level comment indicating the last-verified date and source URL for each provider block.
2. **Merge fallback ELO into benchmarks.ts** using the same `provider/model-id` key format already used there, eliminating the normalized-string key mismatch.
3. **Add a `lastVerified: string` (ISO date) field** to each hardcoded entry in `external-audio.ts` so staleness is explicit.
4. Alternatively, move `external-audio.ts` data to a JSON file (`src/lib/data/external-audio-models.json`) that is easier to diff and update without TypeScript compilation.

## Files affected

- `src/lib/data/benchmarks.ts` — 55 hardcoded model entries (lines 10-65)
- `src/lib/data/external-audio.ts` — 11 hardcoded provider entries, `updatedAt: new Date()` antipattern (line 22)
- `src/lib/api/openrouter.ts` — `getFallbackEloData` with 44 ELO entries (lines 97-152)
