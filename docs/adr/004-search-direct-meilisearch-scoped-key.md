---
title: "ADR-004: Search queries go direct to Meilisearch with a scoped key"
description: >-
  Search-as-you-type talks to Meilisearch directly using a scoped API key
  minted by Bar Assistant; transactional reads/writes use the REST API. The
  master key never reaches a client.
lastUpdated: 2026-08-02T00:00:00.000Z
tableOfContents: true
pagefind: true
---

## Status

Accepted

## Context

Bar Assistant indexes cocktails and ingredients into Meilisearch and ships a
command (`bar:setup-meilisearch`) that mints scoped search keys; the published
image runs it on boot. Salt Rim, the reference client, queries Meilisearch
directly with such a key. Barback needs low-latency search-as-you-type for the
recipe index and ingredient pickers.

## Decision Drivers

- **Latency**: search-as-you-type wants the search engine, not a PHP round
  trip.
- **Established pattern**: this is how the upstream ecosystem already works.
- **Key hygiene**: the master key must stay server-side.

## Considered Options

### Option 1: All search through the REST API

**Pros:** one client-side integration.
**Cons:** every keystroke pays PHP + framework overhead; upstream endpoints
aren't shaped for instant search.

### Option 2: Direct Meilisearch with the scoped key from the API

**Pros:** millisecond queries; native typo tolerance, facets, and tag
filtering (pairs with ADR-002); scoped keys are designed for browser
exposure and are what the API hands to clients.
**Cons:** two client-side data paths (search vs. REST) to keep coherent.

## Decision

We will go with **Option 2**. The client fetches its scoped search key and
host from the API at startup and queries Meilisearch directly for search and
family-filtered browsing. All mutations and canonical reads use the REST API.
The Meilisearch master key exists only in `deploy/.env` (gitignored) and is
consumed by the server container.

## Consequences

### Positive

- Instant search with facet/tag filtering for the family bar.
- No custom search endpoints to build or maintain.

### Negative

- Index freshness depends on Bar Assistant's sync; after seeding or bulk tag
  edits, a `bar:refresh-search` may be needed.
- The client must degrade gracefully if Meilisearch is down while the API is
  up (search unavailable, browsing via REST still works).

## Validation

- **Search latency**: keystroke-to-result under ~50 ms on LAN.
- **Key hygiene**: master key appears nowhere in the client bundle or repo
  history; only scoped keys reach the browser.

## References

- ADR-001, ADR-002
- Upstream: `php artisan bar:setup-meilisearch`, Salt Rim's search
  integration
