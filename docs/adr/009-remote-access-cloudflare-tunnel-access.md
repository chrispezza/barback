---
title: "ADR-009: Remote access — Cloudflare Tunnel + Access at barback.pezza.dev"
description: >-
  Barback goes public at barback.pezza.dev through a Cloudflare Tunnel with
  Cloudflare Access in front, matching the rest of pezza.dev. Go-live is
  deferred until the stack moves off the MacBook to an always-on host (the
  Fedora PC); the compose and env changes land ahead of that.
lastUpdated: 2026-08-23T00:00:00.000Z
tableOfContents: true
pagefind: true
---

## Status

Accepted

## Context

The stack (ADR-005) is LAN-only: the nginx front door on `:8080`, everything
else loopback. Away from the LAN the app degrades to the ADR-007 snapshot —
the shopping list is readable at the store but read-only, and nothing else
works. Worse, the ADR-007 posture is only partially real on the LAN itself:
service workers require a secure context, and `http://<lan-ip>:8080` is not
one, so the shell-cache worker and PWA install don't function on a phone
today.

The rest of pezza.dev already sits behind Cloudflare Access, so the zone,
the Zero Trust account, and the auth pattern all exist. The missing piece is
an origin: a Tunnel terminates on whatever machine runs `cloudflared`, and
the stack currently runs on a MacBook — a machine that sleeps, roams, and
runs Docker only under a logged-in session. A laptop origin means the site
is up only when its owner is home with the lid open, which is precisely when
remote access isn't needed.

## Decision Drivers

- **Store-aisle flow live, not snapshot**: check off the list, mark bottles
  bought, browse recipes away from home.
- **Secure context**: HTTPS makes the ADR-007 service worker and PWA install
  actually work on a phone.
- **Single-user threat model**: an internet-facing pinned PHP app (ADR-001
  bumps deliberately, so CVEs can linger between bumps) plus the Meilisearch
  API surface behind `/search/` must not be reachable anonymously.
- **Consistency**: everything on pezza.dev is behind Cloudflare Access;
  Barback should not be the exception.
- **No new client config**: the ADR-005 single-origin build uses relative
  `/bar` and `/search` URLs and must not need a rebuild per environment.

## Considered Options

### Option 1: Stay LAN-only, lean on the ADR-007 snapshot

**Pros:** zero exposure; nothing to run.
**Cons:** shopping list stays read-only in the aisle; PWA/service worker
remain non-functional on the phone (no secure context on a LAN IP).

### Option 2: Private mesh (Tailscale/WireGuard)

**Pros:** nothing public at all.
**Cons:** still no public HTTPS origin, so the secure-context problem
persists without extra cert machinery; per-device client install; diverges
from how the rest of pezza.dev is accessed.

### Option 3: Cloudflare Tunnel + Cloudflare Access on barback.pezza.dev

**Pros:** no port forwarding or public IP; outbound-only origin; Access
gates the whole origin before the app's own auth, so upstream patch lag
stops being scary; HTTPS secure context unlocks ADR-007; one more container
in the compose file; free tier throughout.
**Cons:** origin availability equals host availability — unusable from a
laptop; when the Access session expires, SPA background fetches get an HTML
redirect instead of JSON until the page is reloaded.

### Option 4: Move the stack to a VPS behind the same Tunnel

**Pros:** always-on immediately; same compose file.
**Cons:** moves the bar's data off-prem; monthly cost; abandons the
ADR-005 home-lab thesis for a problem a home host also solves.

## Decision

We will go with **Option 3**, gated on an always-on host. The stack migrates
from the MacBook to the Fedora PC (a couple of months out); the domain goes
live as part of that move, not before. Concretely:

- A `cloudflared` service joins the compose file, running
  `tunnel run --token ${CLOUDFLARE_TUNNEL_TOKEN}`, with the tunnel's public
  hostname `barback.pezza.dev` pointing at `http://web:80`.
- `BARBACK_ORIGIN` becomes `https://barback.pezza.dev` so Bar Assistant's
  `APP_URL` matches the public origin.
- A Cloudflare Access application covers `barback.pezza.dev` with a
  single-email allow policy and a long (~30 day) session.
- Salt Rim, the API port, and Meilisearch stay loopback-only; the tunnel
  sees nothing but the front door.
- The MacBook remains the dev machine talking to `localhost:8000`,
  unaffected.

Migration itself is the ADR-005 restore drill run for real:
`bar:full-backup` plus a copy of the `bar_data` volume onto the new host,
`docker compose up`, tunnel token moved over.

## Consequences

### Positive

- Live app anywhere; the snapshot becomes the fallback it was designed to
  be rather than the only remote mode.
- ADR-007's installable-PWA posture becomes real (secure context).
- Effective privacy is unchanged — Access limits the origin to one identity;
  the app's own login is a second layer.
- No client rebuild: relative URLs survive the move (ADR-005 payoff).

### Negative

- Availability is now a property of the host; until the PC migration, the
  domain must not go live.
- Expired Access sessions surface as failed fetches until a reload
  re-authenticates — roughly monthly for a single user.
- One more secret (`CLOUDFLARE_TUNNEL_TOKEN`) in `deploy/.env`.

## Validation

- **Secure-context check**: service worker registers and the PWA installs
  from barback.pezza.dev on a phone off the LAN.
- **Exposure check**: anonymous requests to the domain hit the Access login,
  never the app; API and Meilisearch ports remain unreachable directly.
- **Restore drill**: the migration to the PC boots from backup with data
  intact (ADR-005's drill, executed for real).

## References

- ADR-001 (pinned upstream — why anonymous exposure is unacceptable)
- ADR-005 (single origin — why no rebuild is needed)
- ADR-007 (offline posture — what HTTPS unlocks)
- https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- https://developers.cloudflare.com/cloudflare-one/policies/access/
