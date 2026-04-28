---
title: Split ExternalAudioModel interface out of external-audio.ts
severity: medium
category: file-organization / type-locality
session: 54fecdfa-8e5d-4fd3-9368-e5c8be4f4ea3
---

## Problem

`src/lib/data/external-audio.ts` (239 lines) contains both:
1. A private `ExternalAudioModel` interface (lines 1-19) — type definition.
2. `getExternalAudioModels()` — a 220-line hardcoded data array for 11 TTS models
   across 5 providers (ElevenLabs x3, PlayHT x2, Amazon x2, Google x3, Microsoft x1).

The interface is declared locally and is **not exported**, yet `sync-models.ts` re-declares
an effectively identical `AudioModel` interface (lines 60-77) with the same fields. This is
structural duplication: the same shape exists in two places without a shared type.

## Evidence

- `ExternalAudioModel` in `external-audio.ts` lines 1-19: private, not exported.
- `AudioModel` in `sync-models.ts` lines 60-77: identical optional fields
  (`voiceCloning`, `emotionControl`, `realtime`, `naturalness`, `languages`, etc.).
- `src/lib/types/models.ts` already exists as the canonical type file — but
  `ExternalAudioModel` was never moved there.
- The map operation in `sync-models.ts` lines 109-126 manually re-shapes
  `ExternalAudioModel` fields into `AudioModel` fields because the types are not unified.

## Suggested fix

1. Export `ExternalAudioModel` from `src/lib/types/models.ts` (or unify with `AudioModel`
   if the fields are fully compatible after review).
2. Remove the local interface from `external-audio.ts` and import from types.
3. Remove the redundant re-shaping spread in `sync-models.ts` lines 109-126 if the
   unified type satisfies `AudioModel` directly.

## Secondary note (out of scope for this suggestion)

The hardcoded provider data in `external-audio.ts` was identified in session 54fecdfa as
the root cause of missing ElevenLabs models — ElevenLabs is not on Replicate, so it only
appears via this static list. The session discussed replacing this file with live API
fetching (ElevenLabs API, PlayHT API, Azure Cognitive Services API). That is an
architecture change tracked separately; this suggestion covers only the type-duplication
issue that would also need resolving in any refactor.
