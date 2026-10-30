# Security: Mini Jira

Security rules and audit checklist for Mini Jira (Next.js 16 on Vercel, Auth.js v5 with GitHub + Google, MongoDB Atlas, signed webhooks to n8n). Claude Code: follow these rules while writing code, and follow **Audit procedure** at the bottom when asked to "run the security audit".

## What we protect

| Asset | Where it lives | Why it matters |
|---|---|---|
| User accounts (name, email, image) | MongoDB `mini-jira-prod` | Personal data of everyone who signs in |
| Projects and issues | MongoDB | Other people's work; roles decide who can change it |
| `AUTH_SECRET` | Vercel env | Anyone with it can forge sessions |
| OAuth client secrets (GitHub dev/prod, Google) | Vercel env, `.env.local` | Impersonate the app in OAuth flows |
| `MONGODB_URI` | Vercel env, `.env.local` | Full database access |
| `N8N_WEBHOOK_SECRET` | Vercel env, n8n | Forge alerts into LINE |

## Entry points (where untrusted data comes in)

1. Every page and **server action** on the public Vercel URL
2. OAuth callbacks (`/api/auth/callback/*`)
3. IDs and keys in URLs and form data (`/projects/[key]`, issue IDs, member IDs)
4. Issue titles, descriptions and names typed by users
5. The n8n webhook endpoint (public via ngrok), which receives alerts from Mini Jira

## Project rules

### Authentication and sessions
- [ ] `AUTH_SECRET` is long and random, different in dev and prod.
- [ ] Separate OAuth apps for dev and prod; prod callback URLs point only to `https://mini-jira-tan.vercel.app`.
- [ ] Account linking by email only trusts **verified** emails from the provider. No `allowDangerousEmailAccountLinking` unless that check is in place.
- [ ] Session cookies are `Secure` + `HttpOnly` on https (the `__Secure-` prefix), never readable by client JS.

### Authorization (the most important part)
- [ ] **Every** server action and route handler calls `auth()` first and rejects when there's no session.
- [ ] Every action that takes a project key or issue/member ID loads the record **and** checks the caller is a member of that project, on the server. Never trust that "the button was hidden" (IDOR).
- [ ] Admin-only actions (delete issue, manage members, rename/delete project) check the role on the server.
- [ ] The last admin of a project can't be demoted or removed.
- [ ] Queries are scoped by project: an issue lookup always includes `projectId`, never ID alone.

### Input
- [ ] Every action input is parsed with Zod (types, lengths, enums) before use.
- [ ] Mongo filters are built from validated primitives only; user input never becomes an object with `$` operators (NoSQL injection). Mongoose `sanitizeFilter` or strict schemas on.
- [ ] User text is rendered as text. No `dangerouslySetInnerHTML`; if Markdown is ever added, it's sanitized.

### Webhooks to n8n
- [ ] Body signed with HMAC-SHA256 (`X-Signature`), includes `sentAt`; n8n rejects bad signatures and anything older than 5 minutes.
- [ ] Payload contains only what the LINE message needs (no emails, no tokens).
- [ ] Short timeout, fire-and-forget; a failed webhook never breaks the user's action and never leaks the URL in an error.

### Infrastructure
- [ ] MongoDB Atlas: the app's DB user can only read/write `mini-jira-prod` (prod) / `mini-jira` (dev), not admin. If network access is open to `0.0.0.0/0` (needed for Vercel), the password is long and random.
- [ ] Next.js server actions keep the built-in Origin check (no extra `allowedOrigins`).
- [ ] Security headers set in `next.config` (at least `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors 'none'`).
- [ ] No debug routes left in prod (e.g. `/api/health` with DB counts).

### Files that must never be tracked
`.env`, `.env.local`, `.env.*.local`, `.vercel/`, any DB dumps or exports.

## Rules that apply to every project

### Secrets
- [ ] No secret in source code, tests, fixtures, docs, screenshots or commit messages. Secrets come from `.env` / the host's env settings (Vercel, Firebase) / n8n credentials.
- [ ] `.env*` files (except `.env.example`) are in `.gitignore`; `.env.example` lists names only, no values.
- [ ] Different secrets for dev and prod.
- [ ] If a secret was ever committed: **rotate it first**, then clean history. Deleting the file is not enough.

### Private data
- [ ] Logs never contain secrets, tokens, full emails or other personal data.
- [ ] Error messages sent to a browser or chat don't include stack traces, file paths, internal URLs or DB details.
- [ ] Images committed to the repo (README screenshots, assets) are checked for personal data and have EXIF stripped.

### Dependencies
- [ ] Versions locked (`package-lock.json` / pinned `requirements.txt`).
- [ ] `npm audit --omit=dev` / `pip-audit` show no high or critical issues, or each one is noted with why it doesn't apply.
- [ ] No packages added "just in case"; unused packages removed.

### Least privilege
- [ ] Every key, token and DB user has only the access this project needs (one database, read/write only where needed, narrowest OAuth scopes).

---

## Audit procedure (for Claude Code)

Run this when I say "run the security audit", before making a repo public, and before a big deploy.

1. List every tracked file with `git ls-files` and check **each one** against the rules in this file. Also check untracked files that aren't ignored: `git status --porcelain`.
2. Search for secrets in the current tree **and in history**:
   ```bash
   git grep -nIiE "(secret|token|password|passwd|api[_-]?key|bearer|mongodb(\+srv)?://)"
   git grep -nIE "[A-Za-z0-9+/_-]{60,}={0,2}"     # long tokens
   git grep -nIE "\b[0-9a-f]{32}\b"               # 32-hex secrets
   git log -p --all | grep -nIiE "(secret|token|password|bearer|mongodb(\+srv)?://)"
   ```
3. Check `.gitignore` against the private files listed for this project; confirm none of them is tracked.
4. Read every place that handles untrusted input (listed under **Entry points**) and check it against the project rules.
5. Run the dependency audit (`npm audit --omit=dev` and/or `pip-audit`).
6. **Report first, don't fix yet.** Output one table:

   | File | Line | Rule broken | Severity (High / Medium / Low) | Suggested fix |
   |---|---|---|---|---|

   Then a short list of rules that passed. Wait for my "ok" before changing anything. Fix High items first, one commit per fix.
7. If a real secret is found in the tree or history, **stop** and tell me which one, so I can rotate it before anything else.
