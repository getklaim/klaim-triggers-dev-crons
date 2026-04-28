# Suggestion: Add agent/tool state directories to .gitignore

## What was observed

Session `54fecdfa` ran `git status` in `/Users/dgsw68/Desktop/klaim/klaim-triggers-dev-crons` and the output showed two untracked directories:

- `.claude-auto-context/` — Claude Code auto-context and suggestion files (this tool's output)
- `.omc/` — oh-my-claudecode orchestration state (plans, notepad, session state)

The current `.gitignore` (31 lines) covers `node_modules/`, `dist/`, `.env*`, `.trigger/`, and IDE/OS noise, but contains no entry for either directory.

## Why this matters

- **Accidental commits**: a `git add .` or `git add -A` would stage both directories, polluting the repo with local agent state that has no meaning to other contributors or CI.
- **Secret leakage risk**: `.omc/` can contain session notes and plan files that may reference environment-specific details (API keys referenced in plans, internal URLs noted during orchestration, etc.).
- **Repository bloat**: `.claude-auto-context/` will accumulate suggestion files over time; `.omc/state/` stores per-session JSON blobs. Neither belongs in version history.

## Evidence

| Signal | Detail |
|--------|--------|
| Untracked in git status | Both directories listed under "Untracked files" in session `54fecdfa` |
| Absent from .gitignore | Confirmed by reading `.gitignore` — 31 lines, no mention of either path |
| .trigger/ already ignored | The existing `# Trigger.dev` block shows the pattern is established for tool-specific dirs |

## Proposed fix

Add the following two lines to `.gitignore` (e.g., after the `# Trigger.dev` block):

```
# Claude Code / OMC agent state
.claude-auto-context/
.omc/
```

No other changes needed. This is a one-line-per-directory addition.

## Confidence

High. The directories are confirmed untracked, confirmed absent from `.gitignore`, and are purely local agent runtime state with no value in version history.
