# Suggestion: Build script chains prisma generate before tsc — assess CI impact

## Evidence

`package.json` line 7:
```json
"build": "prisma generate && tsc"
```

`src/lib/db.ts` imports:
```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
```

The previous session found that `db.ts` had been edited to fix incorrect imports from `.prisma/client/client` (generated path) back to `@prisma/client` (canonical package). This indicates the file was written before `prisma generate` had been run, then the generated path was copy-pasted as an import.

## Analysis

`prisma generate && tsc` is a valid and common pattern — it ensures the Prisma client types are regenerated before TypeScript compilation. There is no structural bug here.

However, two risks exist:

1. **Developer confusion**: Running `tsc` alone (e.g., via editor or `npx tsc`) will fail with type errors if the generated client is out of sync. The `prisma generate` step is only automated in the `build` script, not in `dev` or any watch script.

2. **CI cold-start**: If a CI pipeline runs `tsc` for type-checking independently of the `build` script, it will fail unless `prisma generate` is called first. The repo has no separate `typecheck` script.

## Recommendation

Add a dedicated `typecheck` script that includes the generate step:

```json
"typecheck": "prisma generate && tsc --noEmit"
```

And optionally a `postinstall` hook to ensure the client is generated after `npm install`:

```json
"postinstall": "prisma generate"
```

This prevents the copy-paste-from-generated-path error that was caught in session 54fecdfa from recurring.

## Priority

Low-Medium. Not a runtime bug, but a developer experience issue that already caused one import error.
