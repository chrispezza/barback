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

## Running the stack

```bash
cp deploy/.env.example deploy/.env   # then set MEILI_MASTER_KEY (openssl rand -base64 32)
pnpm install && pnpm build:deploy    # the web container serves dist/ (ADR-005)
docker compose -f deploy/docker-compose.yml up -d
./scripts/seed.sh
python3 scripts/tag_families.py      # family:* tags + assignments (idempotent)
```

Family curation lives in [scripts/family-assignments.json](scripts/family-assignments.json)
(normalized slugs → family tag); edit it and re-run the script. For the
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
