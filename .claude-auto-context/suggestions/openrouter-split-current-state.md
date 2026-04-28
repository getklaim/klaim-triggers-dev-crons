# Suggestion: openrouter.ts Split — Current State Snapshot (2026-04-28)

**Created**: 2026-04-28
**Severity**: medium
**Category**: file-organization / maintainability
**Supersedes line counts in**: split-openrouter-ts.md, extract-arena-parser.md, openrouter-split-concerns.md, split-openrouter-arena-scraper.md

---

## Why this file exists

Three prior suggestion files (`split-openrouter-ts.md`, `extract-arena-parser.md`, `split-openrouter-arena-scraper.md`) recommend splitting `src/lib/api/openrouter.ts` but cite different line counts (267, 268, 278) because the file was edited across multiple sessions. This file captures the verified current state so future sessions start from accurate data.

---

## Current verified state of openrouter.ts (276 lines, read 2026-04-28)

| Lines | Concern | Functions |
|-------|---------|-----------|
| 1–20 | OpenRouter type interfaces | `OpenRouterModel`, `OpenRouterResponse` |
| 22–65 | Arena leaderboard HTTP scrape + regex parse | `fetchArenaLeaderboard` |
| 67–73 | Model name normalization | `normalizeModelName` |
| 75–106 | Fuzzy ELO score lookup | `findEloScore` |
| 108–163 | Hardcoded fallback ELO data (46 entries) | `getFallbackEloData` |
| 165–174 | ELO-to-popularity conversion | `calculatePopularityFromElo` |
| 176–186 | Price-to-popularity conversion | `calculatePopularityFromPrice` |
| 188–191 | Popularity dispatcher | `calculatePopularity` |
| 193–197 | Tag assignment | `getTags` |
| 199–227 | Image/vision model keyword filter | `isImageOrVisionModel` |
| 229–276 | OpenRouter API fetch + model mapping | `fetchOpenRouterModels` (only public export) |

**Arena-specific surface area**: lines 22–163 = 142 lines (52% of file)
**OpenRouter-specific surface area**: lines 229–276 = 48 lines (17% of file)
**Scoring/utility surface area**: lines 165–227 = 63 lines (23% of file)

---

## Confirmed live URLs (as of 2026-04-28)

| URL | Location in file | Status |
|-----|-----------------|--------|
| `https://arena.ai/leaderboard/text` | line 27 | Active — `/text` suffix was added to fix 403 on `/leaderboard` |
| `https://openrouter.ai/api/v1/models` | line 231 | Active |

Note: `openrouter-split-concerns.md` URL table lists `https://arena.ai/leaderboard` (missing `/text`) — that entry is stale.

---

## Recommended split (unchanged from prior suggestions)

```
src/lib/api/
  openrouter.ts          # interfaces + fetchOpenRouterModels (~50 lines after split)
  arena-scraper.ts       # fetchArenaLeaderboard + normalizeModelName + findEloScore (~80 lines)

src/lib/data/
  arena-fallback-elo.ts  # getFallbackEloData static 46-entry table (~60 lines)
                         # co-located with benchmarks.ts (same static-data convention)

src/lib/utils/           # optional third step
  model-scoring.ts       # calculatePopularity*, getTags, isImageOrVisionModel (~65 lines)
```

Minimum viable split (two files, not four): extract `arena-scraper.ts` + move fallback data to `arena-fallback-elo.ts`. This alone reduces `openrouter.ts` from 276 lines to ~130 lines and isolates the fragile HTML scraping from the stable OpenRouter API logic.

---

## Quantified benefit of the split

- The Arena scraper has required a regex change and a URL path change in separate sessions. Each time, the developer had to navigate a 276-line file mixing API and scraping concerns.
- After the split, the full `arena-scraper.ts` file is readable without offset in a single tool call.
- `getFallbackEloData` (46 hardcoded entries, likely to grow as new models are released) would live in `src/lib/data/` alongside `benchmarks.ts`, matching the existing convention for static reference data.
- No changes required to `sync-models.ts` or any external caller — `fetchOpenRouterModels` signature is unchanged.

---

## Relationship to other suggestion files

- `arena-scraper-debug-script.md`: proposes test fixtures for the scraper (complementary — do after split)
- `cross-repo-model-feature-fragmentation.md`: proposes shared scoring package across 3 repos (larger scope — this split is a prerequisite)
- `deduplicate-model-interfaces.md`: separate issue in sync-models.ts, independent of this split
