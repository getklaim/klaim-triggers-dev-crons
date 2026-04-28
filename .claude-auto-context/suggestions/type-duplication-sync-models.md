# Suggestion: Eliminate duplicate model interface definitions

## Evidence

Two sets of the same four interfaces exist in the codebase:

**`src/lib/types/models.ts`** exports (lines 103-192):
- `TextModel` — has `category: 'text'`, `updatedAt: string`, `capabilities: string[]`
- `ImageModel` — has `category: 'image'`, `updatedAt: string`
- `VideoModel` — has `category: 'video'`, `updatedAt: string`
- `AudioModel` — has `category: 'audio'`, `updatedAt: string`

**`src/trigger/sync-models.ts`** locally declares (lines 11-77):
- `TextModel` — no `category`, no `updatedAt`, no `capabilities`
- `ImageModel` — no `category`, no `updatedAt`
- `VideoModel` — no `category`, no `updatedAt`
- `AudioModel` — no `category`, no `updatedAt`

The local definitions in `sync-models.ts` shadow the canonical exports from `types/models.ts`. Because TypeScript resolves imports by module scope, `sync-models.ts` never uses `types/models.ts` for these four types despite that file existing for exactly this purpose.

## Risk

If a field is added or changed in `types/models.ts` (e.g., adding `capabilities` to the save logic), `sync-models.ts` will silently ignore it because its local definition takes precedence. This is a latent data-loss bug path.

## Fix

Remove the four local interface declarations from `sync-models.ts` (lines 11-77) and add:

```typescript
import type { TextModel, ImageModel, VideoModel, AudioModel } from "../lib/types/models.js";
```

Note: the `types/models.ts` versions include `category` and `updatedAt` which the API fetch functions may or may not return. Align the API response mapping functions (`fetchOpenRouterModels`, etc.) to produce the canonical type, or introduce a separate `ApiModel` subtype in `types/models.ts` that omits `updatedAt` (which is computed at save time, not fetched).

## Priority

High. This is a correctness issue, not just an organization preference. The two type definitions will diverge silently.
