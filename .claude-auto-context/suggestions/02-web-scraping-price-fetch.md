# Suggestion: Replace Per-Model HTML Scraping with Replicate Pricing API

## Issue

`replicate.ts` fetches pricing by making one HTTP GET to `https://replicate.com/{owner}/{name}` per model and extracting a `billingConfig` JSON blob embedded in the HTML. This is used for every image model, every video model, and every audio model independently — sequential scrapes inside `for` loops.

## Quantified evidence

- `fetchPriceFromWebPage` (lines 199-232): 1 HTTP GET per image model inside the sequential `for` loop at line 393
- `fetchVideoPriceFromWebPage` (lines 234-287): 1 HTTP GET per video model inside the sequential `for` loop at line 451
- `fetchAudioPriceFromWebPage` (lines 289-366): 1 HTTP GET per audio model, called twice (once per STT model in the loop at line 510, once per TTS model at line 544)

With a typical Replicate collection response of 20-40 models per category, this means **60-120+ sequential HTML page fetches** per sync run, each paying full page-load latency. The regex `/"billingConfig"\s*:\s*(\{...\})/` at line 109 is inherently fragile — any HTML restructuring on Replicate's side silently returns `undefined`, causing the price to fall back to `0`.

There is also no batching: the `for` loops in `fetchReplicateImageModels`, `fetchReplicateVideoModels`, and `fetchReplicateAudioModels` await each fetch before proceeding to the next model.

## Proposed fix

1. **Check whether Replicate exposes a billing/pricing endpoint** via its official API (e.g., `GET /v1/models/{owner}/{name}` may include cost fields). If available, use it instead of the web page.
2. If no official endpoint exists, convert the sequential fetch loops to **concurrent batches** using `Promise.all` with a concurrency limiter (e.g., p-limit with concurrency=10) so the 60-120 requests run in parallel rather than serially.
3. Add an explicit **price validity guard**: if `billingConfig` parse returns `null`, log a warning and keep the previous DB price rather than writing `0` — prevents a scraping failure from zeroing out all prices.

## Files affected

- `src/lib/api/replicate.ts` — `fetchPriceFromWebPage` (line 199), `fetchVideoPriceFromWebPage` (line 234), `fetchAudioPriceFromWebPage` (line 289), and the three collection-fetch functions (lines 368, 425, 483)
