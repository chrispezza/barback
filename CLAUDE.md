# Barback — repo instructions for Claude Code

Home-bar pantry app ("templates, not recipes"): shelf inventory, can-make matching,
shopping-list gap analysis, recipe index. This repo is the **client only**: Vite + Preact +
preact-iso + TanStack Query, TypeScript strict, pnpm. The backend is stock Bar Assistant
Docker images pinned in `deploy/docker-compose.yml`.

Decisions live in `docs/adr/` (001–009); the spec is `docs/spec/frontend-spec.md`. Read the
relevant ADR before changing architecture. There is no handoff doc.

## Gate

`pnpm build` (`tsc -b && vite build`) is the only gate (ADR-006 calls it the type gate).
There is no test runner, no lint script and no CI. Say so rather than claiming tests passed.

## Invariants (each cites the ADR that owns it)

- **Pinned appliance (ADR-001).** The runtime is `barassistant/server:5.15.3` plus the other
  pinned images in the compose file. Never fork or patch the backend. Missing domain concepts
  go client-side (ADR-002: family tags, typed ratio data). An upgrade is a deliberate tag
  bump, a changelog read and a re-test, and it is Chris's call.
- **Reference clone.** `../bar-assistant-reference` is read-only reference at tag `v5.15.3`.
  Never commit to it, patch it or push it.
- **Design system (ADR-006).** `The Back Bar Design System/` is never patched from `src/`.
  Changes land there as a numbered revision with a changelog row in its `readme.md`; new
  props are additive and optional. No re-implementing DS components in `src/`, no CSS that
  overrides DS internals, import from `index.js` only (`@ds/*`).
- **Voice (DS readme).** No emoji, no exclamation marks, no "we" or "let's", sentence case,
  fraction glyphs not decimals, rose/oxblood never decorative, no new hues, 44px touch
  floor, no invented logo.
- **Search key (ADR-004).** The Meilisearch master key stays server-side; the client gets scoped keys.
- **URLs (ADR-005).** The client never bakes absolute URLs.
- **Service worker (ADR-007).** `/bar/` and `/search/` are never cached.
- **Exposure (ADR-009).** `barback.pezza.dev` does not go live until the stack is on an always-on host.

## Run

- Client: `pnpm install && pnpm dev` (port 5173).
- Full stack: follow the README (`pnpm build:deploy`, compose up via `op run`,
  `scripts/seed.sh`, `scripts/tag_families.py`). The app is on 8080; the API, Salt Rim and
  Meilisearch bind to 127.0.0.1.

## Chris only

Bumping a pinned image tag; the first-boot registration window (`ALLOW_REGISTRATION=true`);
changing the seeded admin credentials before any exposure; TLS or an auth proxy.

## Secrets

`MEILI_MASTER_KEY` comes from 1Password through `op run --env-file=deploy/.env.tpl` (the
template holds `op://` references only; see the README). Never print the local, gitignored
deploy env file. A new secret goes into the template as a reference, never a value.

## Shipping

Conventional commits by hand (`feat(deploy):`, `fix(app):`, `docs(adr):`); PRs are squash-merged.
