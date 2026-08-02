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

## Running the stack

```bash
cp deploy/.env.example deploy/.env   # then set MEILI_MASTER_KEY (openssl rand -base64 32)
docker compose -f deploy/docker-compose.yml up -d
./scripts/seed.sh
```

- API: http://localhost:8000 (OpenAPI docs at `/docs`)
- Salt Rim (upstream admin/reference UI): http://localhost:3000
- Local dev credentials seeded by the script: `admin@example.com` / `password`

## Client development

```bash
pnpm install
pnpm dev
```
