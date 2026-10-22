@AGENTS.md
@PLAN.md
@READMEE.md
When a bug's root cause wasn't obvious, add an entry to LESSONS.md (symptom, root cause, fix, rule) and add the one-line rule under "## Rules" in this file.

## Rules
- The proxy only reads the session; only Auth.js handlers and server actions may set or delete auth cookies (see LESSONS.md).
- With Cache Components, call `await connection()` before any helper that uses crypto/randomness without reading request data first; `requireUser()` already does (see LESSONS.md).
