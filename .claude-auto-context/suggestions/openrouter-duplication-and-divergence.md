# Suggestion: Eliminate Duplicated openrouter.ts Logic Across Two Cron Repos

## Issue

`klaim-triggers-dev-crons` and `klaim-triggers` each contain their own copy of the following files with diverged logic:

| File | klaim-triggers-dev-crons | klaim-triggers |
|---|---|---|
| `src/lib/api/openrouter.ts` | 276 lines | 247 lines |
| `src/lib/data/benchmarks.ts` | 80 lines | 65 lines (same set) |
| `src/lib/types/models.ts` | 193 lines | 193 lines |
| `src/lib/api/replicate.ts` | (present) | (present) |
| `src/lib/data/external-audio.ts` | (present) | (present) |

All five files are duplicated between the two repos. The copies have already diverged in observable ways, causing silent inconsistency.

## Measured Divergences

### openrouter.ts — Arena fetch strategy diverged

`klaim-triggers` fetches Arena ELO from a JSON API:
```
fetch('https://lmarena.ai/api/v1/arena/text/latest')
```
It returns structured `ArenaLeaderboardResponse` with `arena_score`, `votes`, `organization`, etc.

`klaim-triggers-dev-crons` scrapes an HTML page instead:
```
fetch('https://arena.ai/leaderboard/text')
```
with a regex `rowPattern` over raw HTML. Comment says "Arena API is blocked (403)".

These two repos are supposed to perform the same sync job — one as the production runner (Trigger.dev SDK), one as a dev/cron runner — but they now use fundamentally different Arena data sources.

### openrouter.ts — normalizeModelName diverged

`klaim-triggers` strips `preview`, `latest`, `thinking` tokens:
```ts
.replace(/preview/g, '')
.replace(/latest/g, '')
.replace(/thinking/g, '')
```

`klaim-triggers-dev-crons` does not strip those tokens, so model name matching against the ELO map is narrower.

### openrouter.ts — findEloScore diverged

`klaim-triggers-dev-crons` added a more defensive matching algorithm (provider prefix stripping, dot stripping, longest-key preference) that `klaim-triggers` does not have.

### openrouter.ts — popularity/tags logic diverged

`klaim-triggers-dev-crons` added `calculatePopularityFromPrice` as a second-tier fallback when no ELO is found, and a `getTags` function that gates the `popular` tag on both ELO and price. `klaim-triggers` applies `calculatePopularityFromElo(null)` which always returns 0 for no-ELO models, and `getTagsFromElo(null)` which always returns `[]`.

### sync-models — TextModel interface diverged

`klaim-triggers-dev-crons/src/trigger/sync-models.ts` includes `arenaElo: number | null` in its local `TextModel` interface and writes `model.arenaElo ?? benchmark?.arenaElo` to the DB. `klaim-triggers/src/crons/sync-models.ts` does not include `arenaElo` in its local interface and falls back to only `benchmark?.arenaElo`.

## Why This Matters

1. Any update to fallback ELO data, popularity thresholds, or the Arena fetch strategy must be applied in two places. It has already been missed: the Arena strategy diverged without a matching update in the sibling repo.

2. The `TextModel` type is declared identically in both `src/lib/types/models.ts` files (193 lines each), but a local re-declaration in `sync-models.ts` of each repo shadows the shared type — and those shadow types have diverged (`arenaElo` field present in dev-crons, absent in triggers).

3. The 424,696-byte OpenRouter API response plus the Arena page/API fetch are fetched independently by each cron runner. There is no in-process or persistent cache, and no shared response layer. The `FALLBACK_ELO_DATA` map (38 entries, identical between both repos) is the only cache — a hand-maintained static object that must be kept in sync manually.

4. Cross-repo feature tracing required 28+ tool calls in a prior session precisely because the logic is split across `klaim-triggers`, `klaim-triggers-dev-crons`, `klaim-express-backend`, and `klaim-homepage-v3` with no shared package.

## Recommendation

**Option A — Shared internal package (highest value)**
Extract `src/lib/api/openrouter.ts`, `src/lib/types/models.ts`, `src/lib/data/benchmarks.ts`, `src/lib/api/replicate.ts`, and `src/lib/data/external-audio.ts` into a `packages/ai-models-sync` workspace package. Both cron repos import from it. Changes propagate once.

**Option B — Designate one repo as canonical (lower effort)**
Pick `klaim-triggers-dev-crons` as the authoritative source (it has the more recent Arena scraping strategy and the `arenaElo` field), delete the duplicates from `klaim-triggers`, and have `klaim-triggers/src/crons/sync-models.ts` import from the dev-crons package via a relative path or symlink. Not ideal across repo boundaries but removes the divergence immediately.

**Minimum fix regardless of option chosen**
- Reconcile the `normalizeModelName` functions (decide which stripping rules are correct)
- Reconcile the `findEloScore` algorithms (the dev-crons version is more robust; backport it)
- Remove the shadow `TextModel` interface from both `sync-models.ts` files; import from `../lib/types/models.ts` instead

## Evidence Locations

- `/Users/dgsw68/Desktop/klaim/klaim-triggers-dev-crons/src/lib/api/openrouter.ts` (276 lines)
- `/Users/dgsw68/Desktop/klaim/klaim-triggers/src/lib/api/openrouter.ts` (247 lines)
- `/Users/dgsw68/Desktop/klaim/klaim-triggers-dev-crons/src/trigger/sync-models.ts` (462 lines)
- `/Users/dgsw68/Desktop/klaim/klaim-triggers/src/crons/sync-models.ts` (448 lines)
- `/Users/dgsw68/Desktop/klaim/klaim-triggers-dev-crons/src/lib/types/models.ts` (193 lines, identical twin)
- `/Users/dgsw68/Desktop/klaim/klaim-triggers/src/lib/types/models.ts` (193 lines, identical twin)
