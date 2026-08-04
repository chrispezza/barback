---
title: "ADR-007: Installable client and the offline posture"
description: >-
  Barback ships as a PWA (manifest + icons) with a minimal shell-cache service
  worker and a stamped localStorage snapshot of the shopping list. The API is
  never cached and offline write-sync is deliberately out of scope.
lastUpdated: 2026-08-04T00:00:00.000Z
tableOfContents: true
pagefind: true
---

## Status

Accepted

## Context

The deployment is LAN/tailnet-only (ADR-005, hardened to a single published
front-door port). The app's primary surface became the phone the moment it
was installable — and the one place the shopping list matters most is a
store aisle, where the home API is unreachable unless the tailnet VPN is up.
Service workers require a secure context, which the tailnet provides via
`tailscale serve` TLS on the `ts.net` name.

## Decision Drivers

- **The store-aisle journey**: the list must be readable with no connection
  to the API at all.
- **Trust in stock data**: a stale "can pour" answer is worse than none.
- **Home-lab scale**: one user, no server-side session fan-out, no conflict
  resolution worth building.

## Considered Options

1. Manifest-only PWA (icon and standalone window, nothing offline).
2. Shell-cache service worker + read-only list snapshot (chosen).
3. Full offline sync: cached API reads plus a queued-mutation outbox.

## Decision

Option 2. The service worker (`public/sw.js`) caches hashed assets
cache-first and navigations network-first with a cached `index.html`
fallback; `/bar/` and `/search/` are never cached. The last successful
shopping-list response is stamped into localStorage and rendered read-only
("Offline — the list as it stood …") when the API is unreachable. A printed
list remains the zero-battery fallback.

## Consequences

- The installed app opens anywhere; live data requires the tailnet.
- No stock answer is ever served stale: screens that need the API say so in
  the error voice rather than showing cached matches.
- Offline check-off is not supported; mutations require connectivity.
- Full sync (option 3) is deliberately deferred until Barback has users who
  won't run a VPN — it would need an outbox, conflict policy, and upstream
  idempotency guarantees that a single-user deployment never exercises.

## Validation

- Kill the API containers: the installed app still opens; the rail shows the
  stamped snapshot; every other section shows the error line.
- `curl` the served page over `https://<machine>.ts.net`: `sw.js` and
  `manifest.webmanifest` return 200; registration occurs only in production
  builds.

## References

- ADR-005 (single origin) — the worker's cache boundary is the front door's
  path split.
- `src/api/queries.ts` (`readListSnapshot`), `public/sw.js`, `src/main.tsx`.
