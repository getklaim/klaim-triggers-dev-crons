# Suggestion: Broad glob patterns traverse node_modules and return noise results

## What was observed

Running `**/*.ts` from the project root (`/Users/dgsw68/Desktop/klaim/klaim-triggers-dev-crons`) returned results dominated by `node_modules/` declaration files. The result set was truncated before reaching any source file, meaning an agent or tool relying on this pattern to discover project source files would see zero application code in the initial result window.

Quantified counts from this session:

| Scope | .ts / .d.ts files |
|-------|-------------------|
| `src/**/*.ts` (project source) | **8 files** |
| `**/*.ts` from root (before truncation) | 100+ results, all from `node_modules/` |

The first source file (`src/lib/data/benchmarks.ts`) did not appear in the broad-glob output at all — the list was cut before reaching it.

## Why this matters

1. **Agent file-discovery breaks silently.** When an agent issues `**/*.ts` to understand the project's TypeScript surface, it receives exclusively dependency `.d.ts` files. It may conclude the project has no source of its own, or it will waste tool-call budget reading irrelevant vendored typings.

2. **`tsconfig.json` already scopes correctly — but tools don't use it.** `tsconfig.json` has `"include": ["src/**/*"]` and `"exclude": ["node_modules", "dist"]`, so the TypeScript compiler is correctly scoped. The mismatch is in ad-hoc glob usage (IDE integrations, agent file search, script tooling) that does not read `tsconfig.json`.

3. **`.gitignore` excludes `node_modules/` from version control but not from filesystem globs.** The directory physically exists on disk, so any glob traversal that does not explicitly exclude it will walk it.

## Evidence

| Signal | Detail |
|--------|--------|
| `**/*.ts` result set truncated | 100+ node_modules hits returned before a single src/ file |
| `src/**/*.ts` returns exactly 8 files | Confirms the actual source surface is tiny — noise ratio is >92% |
| `tsconfig.json` line 19 | `"include": ["src/**/*"]` — compiler is correctly scoped |
| `tsconfig.json` line 20 | `"exclude": ["node_modules", "dist"]` — exclusion exists for tsc but not for ad-hoc globs |
| `node_modules/` present on disk | Confirmed by glob traversal returning results from it |

## Proposed fix

**For agent/tool file searches:** Always anchor globs to `src/` rather than the project root:

- Use `src/**/*.ts` instead of `**/*.ts`
- Use `src/**/*.{ts,js}` instead of `**/*.{ts,js}`

**For any script or automation that must start from the root:** Explicitly exclude `node_modules` and `dist`:

```bash
# Example: find all TypeScript source files
find . -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*"
```

**Optional — add a `.claude-auto-context/glob-hints.json` (or similar) config file** that documents the canonical source root as `src/` so agents bootstrapping on this repo know to scope their searches.

No changes to `tsconfig.json`, `package.json`, or `.gitignore` are required — those are already correctly configured.

## Priority

Medium. This does not cause a runtime or build failure, but it reliably causes agent sessions to waste tool-call budget on node_modules files and can cause incorrect project-structure assessments. Given that this repo has only 8 source files, any broad-glob session starts with a >92% noise hit rate.
