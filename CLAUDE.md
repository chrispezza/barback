# Barback — repo instructions for Claude Code

Home-bar pantry app ("templates, not recipes"): shelf inventory, can-make matching,
shopping-list gap analysis, recipe index. This repo is the **client only**: Vite + Preact +
preact-iso + TanStack Query, TypeScript strict, pnpm. The backend is stock Bar Assistant
Docker images pinned in `deploy/docker-compose.yml`.

The spec is `docs/spec/frontend-spec.md`. Session handoffs are `docs/handoff/<date>.md`;
read the newest one before starting work.

## Gate

Two commands, both local; there is no CI (ADR-011).

- `pnpm build` runs `scripts/check.mjs` (text checks whose failure messages name the ADR
  they guard), then `tsc -b` (ADR-006 calls this the type gate; it also checks tests and
  fixtures), then `vitest run`, then `vite build`.
- `pnpm verify` runs the Playwright journeys against fixtures. It needs a browser installed
  once (`pnpm exec playwright install chromium`) and never the live stack.

Run both before every PR and say in the PR body which ran and what they reported. There is
no lint script. `The Back Bar Design System/_adherence.oxlintrc.json` is a leftover of the
tool that generated the design system: it is not wired in, it is out of date, and it is not
a gate.

## Decisions

Decisions live in `docs/adr/`. This table is an index, not the rules: **the ADR is the
rule.** Before changing anything in a row's "Read before touching" column, read that ADR in
full. If this file and an ADR disagree, the ADR wins; say so in the PR.

| ADR | Decides | Read before touching |
|---|---|---|
| [001](docs/adr/001-bar-assistant-as-upstream-appliance.md) | The backend is a pinned, unmodified upstream image | `deploy/docker-compose.yml` image tags, anything that would change the backend, `../bar-assistant-reference` |
| [002](docs/adr/002-families-and-ratio-data-ownership.md) | Where family and ratio data live | `src/data/`, `scripts/tag_families.py`, `scripts/family-*.json`, any new domain concept |
| [003](docs/adr/003-client-stack-vite-preact-spa.md) | The client stack | `package.json` dependencies, `vite.config.ts`, `tsconfig*.json` |
| [004](docs/adr/004-search-direct-meilisearch-scoped-key.md) | How search reaches Meilisearch and which key the client holds | `src/api/search.ts`, anything that handles a Meilisearch key |
| [005](docs/adr/005-deployment-single-compose-single-origin.md) | One compose stack, one origin | `deploy/`, `src/api/client.ts`, `src/api/search.ts`, any URL in `src/` |
| [006](docs/adr/006-design-system-consumed-as-vendored-delivery.md) | How the design system is consumed and how it may change | `The Back Bar Design System/`, any `@ds/` import, `src/index.css`, any new component in `src/` |
| [007](docs/adr/007-installable-client-offline-posture.md) | What the service worker caches and what works offline | `public/sw.js`, `public/manifest.webmanifest`, the list snapshot in `src/api/queries.ts` |
| [008](docs/adr/008-purchasing-intelligence-standing-orders.md) | When the app may write to the shopping list, and buy-next ranking | `src/data/staples.ts`, `src/data/first-pours.ts`, `src/data/buy-next.ts`, `src/screens/Tonight.tsx` |
| [009](docs/adr/009-remote-access-cloudflare-tunnel-access.md) | Remote access, and when the public domain may go live | `cloudflared`, `BARBACK_ORIGIN`, anything about `barback.pezza.dev` |
| [010](docs/adr/010-agent-governance-index-and-records.md) | How this file and the ADRs govern agents | this file, `docs/adr/`, `scripts/check.mjs` |
| [011](docs/adr/011-test-gate-vitest-playwright.md) | What `pnpm build` and `pnpm verify` run, and where tests and fixtures live | `package.json` scripts and devDependencies, `vitest.config.ts`, `playwright.config.ts`, any `*.test.ts(x)`, `e2e/`, `test/` |

## Rules no ADR holds

- **Reference clone.** `../bar-assistant-reference` is read-only reference at tag `v5.15.3`.
  Never commit to it, patch it or push it.
- **Voice and visual rules.** Any user-facing copy or styling follows "Content fundamentals"
  and "Visual foundations" in `The Back Bar Design System/readme.md`. Read them before
  writing copy or CSS.
- **Secrets.** `MEILI_MASTER_KEY` comes from 1Password through
  `op run --env-file=deploy/.env.tpl` (the template holds `op://` references only; see the
  README). Never print the local, gitignored deploy env file. A new secret goes into the
  template as a reference, never a value.

## Chris only

Propose these in the PR body or an issue; do not do or merge them yourself.

- Bumping a pinned image tag; the first-boot registration window
  (`ALLOW_REGISTRATION=true`); changing the seeded admin credentials before any exposure;
  TLS or an auth proxy; taking `barback.pezza.dev` live.
- Changing an ADR's Status or Decision, adding an ADR, or changing this file or
  `scripts/check.mjs`. If a decision blocks the task, or looks wrong, stop and say which
  ADR and why; if the fix is clear, open a PR that changes the record and leave it
  unmerged (ADR-010). Never change a record or a check to make a code change pass.

## Run

- Client: `pnpm install && pnpm dev` (port 5173).
- Full stack: follow the README (`pnpm build:deploy`, compose up via `op run`,
  `scripts/seed.sh`, `scripts/tag_families.py`). The app is on 8080; the API, Salt Rim and
  Meilisearch bind to 127.0.0.1.

## Shipping

Conventional commits by hand (`feat(deploy):`, `fix(app):`, `docs(adr):`); PRs are squash-merged.
