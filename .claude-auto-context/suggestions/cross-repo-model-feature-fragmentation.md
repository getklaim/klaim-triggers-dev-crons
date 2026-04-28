# Suggestion: AI Model Sorting/Popularity Feature Spans 3 Repos — Consider Consolidation

## Problem

The AI model popularity/sorting feature is split across three separate repositories:
- `klaim-express-backend`
- `klaim-homepage-v3`
- `klaim-triggers-dev-crons` (this repo — source of truth for ELO data via sync-models.ts)

Cross-session observation recorded 28+ tool calls just to trace the feature end-to-end. This is a diagnostic overhead symptom: when a feature lives in 3 repos, any bug, schema change, or ranking logic update forces a multi-repo context load before a developer can reason about the full picture.

## Concrete signal

- 28+ tool calls to trace a single feature across repos in one cross-cycle observation.
- The ELO-based popularity score computed in `openrouter.ts` feeds into the DB via `sync-models.ts`, then the backend reads it, then the homepage renders it. A change to the scoring formula (e.g., adjusting `calculatePopularityFromElo` thresholds) requires understanding how the backend surfaces the field and how the homepage consumes it — none of which is visible from within this repo.

## Options

### Option A: Shared scoring package (recommended if repos are a monorepo or can share packages)
Extract `normalizeModelName`, `calculatePopularityFromElo`, and the scoring thresholds into a `@klaim/model-scoring` internal package. All three repos import it. A single change propagates everywhere.

### Option B: Centralize popularity computation in the backend
Move ELO-to-popularity mapping out of the cron job and into the backend query layer. The cron stores raw ELO scores; the backend computes popularity at read time. This makes the scoring logic visible in one place (the API layer) and removes the need to re-sync when thresholds change.

### Option C: Document the cross-repo contract explicitly
If consolidation is not feasible now, at minimum add a `CROSS_REPO.md` or a comment block in `sync-models.ts` and `openrouter.ts` listing which fields flow to which repos and what schema version they expect. This reduces the 28-call trace to a single file read.

## Effort Estimate

- Option A: Medium (package setup, CI changes across 3 repos)
- Option B: Medium (backend refactor, cron simplification)
- Option C: Low (documentation only, immediate value)

Option C is a cheap first step that captures value immediately regardless of whether A or B is pursued later.
