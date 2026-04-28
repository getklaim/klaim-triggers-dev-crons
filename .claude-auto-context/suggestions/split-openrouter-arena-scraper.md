# Suggestion: Split openrouter.ts into focused modules

**Created**: 2026-04-28
**Severity**: medium
**Category**: file-organization / maintainability

---

## Evidence

- `src/lib/api/openrouter.ts` is 268 lines of logic spanning 4 distinct concerns
- The same file sections were read twice in a single session (offsets 25+15 then 25+45), indicating the file's size and mixed responsibilities caused navigation friction
- A 4.2 MB HTML file was downloaded to `/tmp/arena.html` for manual debugging, and multiple `node -e` inline scripts were needed to iterate on regex patterns — a classic sign that the scraping logic has no dedicated test surface
- The fallback ELO `Record<string, number>` object is 47 lines of hardcoded data sitting inside the same module as API fetch logic

## Concerns in the current file

| Concern | Lines (approx.) | Should live in |
|---|---|---|
| OpenRouter API fetch + model mapping | ~46 (L222–268) | `openrouter.ts` (keep) |
| Arena leaderboard HTTP scraping | ~44 (L22–66) | `arena-scraper.ts` (new) |
| Model name normalization + ELO lookup | ~31 (L68–99) | `arena-scraper.ts` (new) |
| Hardcoded fallback ELO data | ~55 (L101–156) | `arena-fallback-elo.ts` (new) |
| Popularity / tag calculation helpers | ~32 (L158–190) | `openrouter.ts` or shared util |
| Image-model keyword filter | ~28 (L192–220) | `openrouter.ts` (keep, minor) |

## Recommended refactor

**New file: `src/lib/api/arena-scraper.ts`**
- Export `fetchArenaLeaderboard(): Promise<Map<string, number>>`
- Export `normalizeModelName(name: string): string`
- Export `findEloScore(modelId: string, eloMap: Map<string, number>): number | null`
- Import fallback data from `arena-fallback-elo.ts`

**New file: `src/lib/data/arena-fallback-elo.ts`**
- Export `getFallbackEloData(): Map<string, number>` with the 47-entry static table
- Keeping it separate makes the hardcoded data easy to update without touching any fetch logic

**`src/lib/api/openrouter.ts` (trimmed)**
- Imports `fetchArenaLeaderboard` and `findEloScore` from `arena-scraper.ts`
- Retains only: interfaces, `fetchOpenRouterModels`, popularity/tag helpers, image-filter helper
- Projected line count after split: ~100 lines (currently 268 — a 63 % reduction)

## Why this matters

- The regex debugging loop (multiple `node -e` tests against `/tmp/arena.html`) would be replaced by a proper test file (`arena-scraper.test.ts`) that imports and exercises `fetchArenaLeaderboard` with a fixture HTML string, making future pattern changes safe
- `getFallbackEloData` changes (new models added, stale ELO values) are a routine maintenance task; isolating it avoids touching the fetch/mapping code on every update
- `arena-scraper.ts` can be independently mocked in tests for `fetchOpenRouterModels`, removing the live HTTP dependency from unit tests

## Suggested test file

`src/lib/api/arena-scraper.test.ts`
- Load a small fixture HTML string containing a few `href="/model/..."` and `<span class="text-sm">` elements
- Assert `fetchArenaLeaderboard` (with `fetch` mocked) returns the expected `Map` entries
- Assert `normalizeModelName` strips dates, suffixes, and punctuation correctly (the debugging loop revealed this logic is non-trivial)

## No breaking changes required

`fetchOpenRouterModels` signature is unchanged. Only internal imports move.
`sync-models.ts` does not import anything from `openrouter.ts` internals — it calls only `fetchOpenRouterModels` — so the refactor is fully internal.
