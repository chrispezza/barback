---
title: "ADR-005: Deployment — one compose stack, one origin"
description: >-
  Everything runs from a single docker-compose file with published images; the
  eventual production shape puts client, API, and search behind one reverse
  proxy origin. SQLite volume plus bar:full-backup covers data protection.
lastUpdated: 2026-08-02T00:00:00.000Z
tableOfContents: true
pagefind: true
---

## Status

Accepted

## Context

Barback is a single-user home-lab deployment. The moving parts are the Bar
Assistant server image, Meilisearch, Redis, the Salt Rim admin/reference UI,
and (eventually) the Barback static build. During development, services are
exposed on separate localhost ports and CORS is tolerated; that is not the
end state.

## Decision Drivers

- **Operational simplicity**: one file, `docker compose up`, published images
  only (ADR-001).
- **CORS elimination**: one origin for client, API, and search in the real
  deployment.
- **Data safety**: all state is one SQLite file plus uploads in a single
  volume.

## Considered Options

### Option 1: Separate ports per service (dev shape) forever

**Pros:** zero proxy config.
**Cons:** CORS configuration in perpetuity; multiple origins to remember;
scoped keys and API URLs vary by port.

### Option 2: Single compose with a reverse proxy fronting one origin

**Pros:** one URL; no CORS; path-based routing (`/` client, `/bar` API,
`/search` Meilisearch) mirrors the upstream documented pattern.
**Cons:** one more container and a small proxy config.

## Decision

We will go with **Option 2** as the production shape. The compose file lives
in [deploy/](../../deploy/) and starts with the dev shape (direct ports); a
reverse proxy service is added when Barback ships its first usable build.
Backups use the upstream `bar:full-backup` command plus a copy of the
`bar_data` volume.

## Consequences

### Positive

- Whole system is reproducible from the repo with one command.
- Single-origin end state removes CORS and simplifies client config to
  relative URLs.

### Negative

- Until the proxy is added, dev runs multi-origin and CORS-dependent — the
  client must not bake absolute URLs in deep.

## Validation

- **Cold start**: fresh host + `docker compose up -d` + seed script yields a
  working system.
- **Restore drill**: a backup restored into a clean volume boots with data
  intact.

## References

- ADR-001, ADR-003, ADR-004
- https://docs.barassistant.app/ (official multi-service example)
