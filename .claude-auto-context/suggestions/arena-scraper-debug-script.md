# Suggestion: Add a Dedicated Debug/Test Script for Arena Scraper Logic

**Created**: 2026-04-28
**Session**: 54fecdfa-8e5d-4fd3-9368-e5c8be4f4ea3
**Severity**: medium
**Category**: debugging-friction / testability

---

## Evidence

Session 54fecdfa required **8+ bash commands** to diagnose what turned out to be a single URL endpoint issue (`/leaderboard` vs `/leaderboard/text`). The investigation pattern was:

1. Download `arena.ai` page to `/tmp/arena.html` (~3.8 MB)
2. Run multiple `node -e` inline scripts testing different regex patterns against the file
3. Iterate on patterns 3–4 times before finding a match
4. Edit `openrouter.ts` with the working pattern
5. Run a build + commit pipeline

This is a **5-step manual loop** for a change that should require: one failing test assertion → one code fix → one passing test.

The root cause of the specific incident was a URL path difference: the code had `https://arena.ai/leaderboard` but the correct endpoint is `https://arena.ai/leaderboard/text`. Without a test fixture, the only way to verify the correct URL is to fetch it live, download the HTML, and probe it interactively.

## What is missing

There is no test file or debug script for `fetchArenaLeaderboard`. The function in `src/lib/api/openrouter.ts` (lines 22–65) makes a live HTTP request and parses the response with a regex. There is no:
- HTML fixture representing a real Arena leaderboard page structure
- Unit test asserting that the regex extracts the expected `(model-name, elo-score)` pairs
- Test asserting `normalizeModelName` handles dates, version suffixes, and punctuation correctly (the normalization logic is non-trivial: strips `[-_\s]`, strips `20\d{6}` date patterns, strips trailing `\d+k`)

## Proposed fix

### 1. Create a minimal HTML fixture

`src/lib/api/__fixtures__/arena-leaderboard.html` — a stripped-down HTML fragment containing 3–5 representative rows from the real Arena leaderboard page, enough to exercise the current regex:

```html
<!-- representative row structure for arena.ai/leaderboard/text -->
<tr>
  <td title="claude-3-7-sonnet-20250219">
    <span class="max-w-full truncate">claude-3-7-sonnet</span>
    ...
    <span class="text-sm">1389</span>
  </td>
</tr>
```

### 2. Create a test file

`src/lib/api/arena-scraper.test.ts` (or co-located with a future `arena-scraper.ts` after the split proposed in `split-openrouter-arena-scraper.md`):

```typescript
import { describe, it, expect, vi } from 'vitest';
// Once arena logic is extracted:
// import { fetchArenaLeaderboard, normalizeModelName, findEloScore } from './arena-scraper.js';

describe('normalizeModelName', () => {
  it('strips date suffixes', () => {
    expect(normalizeModelName('claude-3-7-sonnet-20250219')).toBe('claude37sonnet');
  });
  it('strips trailing k', () => {
    expect(normalizeModelName('llama-3.1-70b-128k')).toBe('llama3170b');
  });
});

describe('fetchArenaLeaderboard', () => {
  it('parses model rows from fixture HTML', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(fixtureHtml),
    } as Response);

    const map = await fetchArenaLeaderboard();
    expect(map.get('claude37sonnet')).toBe(1389);
    expect(map.size).toBeGreaterThan(0);
  });
});
```

### 3. Note the confirmed correct URL

The Arena leaderboard endpoint is `https://arena.ai/leaderboard/text` (confirmed in session 54fecdfa). The existing suggestion file `openrouter-split-concerns.md` records it as `https://arena.ai/leaderboard` (missing the `/text` suffix) — that table entry is inaccurate. The actual line 27 of `openrouter.ts` already has the corrected URL.

## Why this is not covered by existing split proposals

The existing `split-openrouter-arena-scraper.md`, `extract-arena-parser.md`, and `openrouter-split-concerns.md` proposals focus on **module organization** — moving the scraper into its own file. This proposal focuses on **test infrastructure**: the 8-command debug loop is a symptom of missing fixtures and assertions, which would persist even after the code is moved to a dedicated file.

The two proposals are complementary: extract first (easier to test in isolation), then add fixtures. But the fixture gap is the more immediate source of friction — it is what forced the `/tmp/arena.html` download and the `node -e` iteration loop.

## Effort estimate

- HTML fixture: 15 minutes (copy 5 rows from a real Arena page response)
- `normalizeModelName` unit tests: 20 minutes
- `fetchArenaLeaderboard` mock test: 30 minutes

Total: ~1 hour. This eliminates the need for any future `/tmp/arena.html` debugging session.
