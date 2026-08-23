# Barback

Home-bar pantry app: inventory shelf, "what can I make tonight," shopping-list
gap analysis, recipe index. The product thesis is **templates, not recipes**.

Barback is a client. The backend is an unmodified, version-pinned
[Bar Assistant](https://github.com/karlomikus/bar-assistant) instance — see
[ADR-001](docs/adr/001-bar-assistant-as-upstream-appliance.md). The visual
identity is **The Back Bar** design system —
[docs/design/the-back-bar.md](docs/design/the-back-bar.md), tokens in
[docs/design/tokens.css](docs/design/tokens.css).

## Architecture

Decisions live in [docs/adr/](docs/adr/):

| ADR | Decision |
|---|---|
| [001](docs/adr/001-bar-assistant-as-upstream-appliance.md) | Bar Assistant as pinned upstream appliance; never forked |
| [002](docs/adr/002-families-and-ratio-data-ownership.md) | Family taxonomy as API tags; ratio templates as typed client data |
| [003](docs/adr/003-client-stack-vite-preact-spa.md) | Vite + Preact + TypeScript strict SPA, TanStack Query |
| [004](docs/adr/004-search-direct-meilisearch-scoped-key.md) | Search direct to Meilisearch with scoped keys |
| [005](docs/adr/005-deployment-single-compose-single-origin.md) | One compose stack; single-origin reverse proxy as end state |
| [006](docs/adr/006-design-system-consumed-as-vendored-delivery.md) | Design system consumed as an unmodified vendored delivery via `@ds` alias |
| [007](docs/adr/007-installable-client-offline-posture.md) | Installable PWA; shell-cache worker + list snapshot; API never cached; sync deferred |
| [008](docs/adr/008-purchasing-intelligence-standing-orders.md) | Staples are standing orders (auto-queue); app suggestions require a tap; aspiration outranks server rank |
| [009](docs/adr/009-remote-access-cloudflare-tunnel-access.md) | Public at barback.pezza.dev via Cloudflare Tunnel + Access; gated on migration to an always-on host |

## Running the stack

```bash
cp deploy/.env.example deploy/.env   # then set MEILI_MASTER_KEY (openssl rand -base64 32)
pnpm install && pnpm build:deploy    # the web container serves dist/ (ADR-005)
ALLOW_REGISTRATION=true docker compose -f deploy/docker-compose.yml up -d
./scripts/seed.sh                    # creates your user while registration is open
docker compose -f deploy/docker-compose.yml up -d   # re-up: registration closes
python3 scripts/tag_families.py      # family:* tags + assignments (idempotent)
```

Family curation lives in [scripts/family-assignments.json](scripts/family-assignments.json)
(normalized slugs → family tag); edit it and re-run the script. Par-level
staples (bottles the bar should never run out of) are curated in
[src/data/staples.ts](src/data/staples.ts) by canonical ingredient slug —
the file is a standing order: a staple that leaves the shelf is queued to
the shopping list automatically, with a toast and a "staple" note on the
row. The First pours roster (onboarding classics; each pick favorites the
drink and queues its missing bottles) lives in
[src/data/first-pours.ts](src/data/first-pours.ts). A minimal shell-cache
service worker plus a stamped localStorage snapshot keep the shopping list
readable away from the LAN (the store aisle); the API itself is never
cached. For the
uncurated backlog, `python3 scripts/propose_families.py` drafts structural
proposals with reasons to [scripts/family-proposals.json](scripts/family-proposals.json)
— review, move keepers into the assignments file, rerun the tag script.

- App (single-origin front door): http://localhost:8080 — proxies `/bar/` → API,
  `/search/` → Meilisearch; set `BARBACK_ORIGIN` in `deploy/.env` for LAN access
- API direct: http://localhost:8000 (OpenAPI docs at `/docs`)
- Salt Rim (upstream admin/reference UI): http://localhost:3000
- Local dev credentials seeded by the script: `admin@example.com` / `password`

## Vintage imports

Public-domain books live as transcribed batches in [scripts/vintage/](scripts/vintage/)
(Thomas 1862, Winter 1884 — period measures modernized, substitutions noted
per-ingredient). Imports are idempotent (duplicates skipped by name) and each
maintains a per-book collection:

```bash
python3 scripts/import_vintage.py scripts/vintage/thomas-1862.json
```

## Client development

```bash
pnpm install
pnpm dev
```

## A note before exposing this to the internet

The compose stack is tuned for a home LAN: the `:8080` front door is the only
port the network sees (API, Meilisearch and Salt Rim bind to loopback),
registration is closed outside first boot, and login is the only write gate —
but nothing terminates TLS. That is the right posture behind your router and
still the wrong one on a public host. If you must expose it, change the seeded
password first, and put real TLS and an auth proxy in front.

## Built on

Barback is a client; the heavy lifting is upstream open source, consumed as
pinned Docker images (ADR-001) and gratefully acknowledged:

- [Bar Assistant](https://github.com/karlomikus/bar-assistant) (MIT, Karlo
  Mikuš) — inventory, matching and recipe engine
- [Salt Rim](https://github.com/karlomikus/vue-salt-rim) (MIT, Karlo Mikuš) —
  upstream web client, kept alongside as the admin/reference UI
- [Meilisearch](https://github.com/meilisearch/meilisearch) (MIT) — search
- [Preact](https://preactjs.com) + [preact-iso](https://github.com/preactjs/preact-iso),
  [TanStack Query](https://tanstack.com/query), [Vite](https://vite.dev),
  [TypeScript](https://www.typescriptlang.org) — the client stack
- Libre Caslon Display & Text (SIL OFL) — the system's two voices
- Jerry Thomas' *How to Mix Drinks* (1862) and George Winter's *How to Mix
  Drinks — Bar Keepers' Handbook* (1884) — public-domain sources for the
  vintage imports

Barback itself is [MIT licensed](LICENSE).
