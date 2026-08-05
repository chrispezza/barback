#!/usr/bin/env python3
"""Draft family assignments for unfamilied cocktails (ADR-002 backlog tool).

Structural heuristics only — proposes, NEVER applies. Output goes to
scripts/family-proposals.json with a per-drink reason; review it, move the
slugs you agree with into family-assignments.json, then run tag_families.py.

Usage: python3 scripts/propose_families.py
"""

import json
import os
import urllib.request
from pathlib import Path

API = os.environ.get("API_URL", "http://localhost:8000")
EMAIL = os.environ.get("SEED_EMAIL", "admin@example.com")
PASSWORD = os.environ.get("SEED_PASSWORD", "password")
# Post-hardening the seeded password is rotated; a personal access token is
# the durable way in (mint one in Salt Rim or the DB, export BARBACK_TOKEN).
TOKEN = os.environ.get("BARBACK_TOKEN")
BAR_ID = os.environ.get("BAR_ID", "1")


def call(path: str, method: str = "GET", body: dict | None = None, token: str | None = None):
    req = urllib.request.Request(f"{API}/api{path}", method=method)
    req.add_header("Accept", "application/json")
    req.add_header("Bar-Assistant-Bar-Id", BAR_ID)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = None
    if body is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    with urllib.request.urlopen(req, data) as res:
        return json.loads(res.read())


# Ingredient-name markers, matched case-insensitively as substrings.
DAIRY = ("cream", "milk", "ice cream", "chocolate", "cacao", "coffee", "espresso", "egg yolk")
TIKI = ("orgeat", "falernum", "passion fruit", "passionfruit", "coconut", "pineapple")
LENGTHENERS = (
    "club soda", "soda water", "tonic", "ginger beer", "ginger ale", "cola",
    "sparkling", "champagne", "prosecco", "grapefruit soda", "lemonade", "beer",
)
CITRUS = ("lime juice", "lemon juice", "grapefruit juice")
SWEET = ("syrup", "sugar", "honey", "grenadine", "liqueur", "curaçao", "curacao")
STIRRED_MODIFIERS = ("vermouth", "amaro", "bitters", "liqueur", "sherry", "port", "chartreuse")


def classify(names: list[str]) -> tuple[str, str] | None:
    """Return (family, reason) or None when no lens fits confidently."""
    joined = [n.lower() for n in names]

    def any_of(markers):
        return [m for m in markers if any(m in n for n in joined)]

    rums = [n for n in joined if "rum" in n or "rhum" in n]
    dairy = any_of(DAIRY)
    tiki = any_of(TIKI)
    lengthener = any_of(LENGTHENERS)
    citrus = any_of(CITRUS)
    sweet = any_of(SWEET)

    if dairy:
        return ("family:dessert", f"dairy/coffee weight: {', '.join(dairy)}")
    if rums and (tiki or len(rums) >= 2):
        why = f"{len(rums)} rums" if len(rums) >= 2 else f"rum + {', '.join(tiki)}"
        return ("family:tiki", why)
    if lengthener:
        return ("family:highball", f"lengthened with {', '.join(lengthener)}")
    if citrus and sweet:
        return ("family:sour", f"{', '.join(citrus)} against {sweet[0]}")
    if not citrus and any_of(STIRRED_MODIFIERS):
        return ("family:spirit-forward", f"no juice; modified by {any_of(STIRRED_MODIFIERS)[0]}")
    return None


def main() -> int:
    token = TOKEN or call("/auth/login", "POST", {"email": EMAIL, "password": PASSWORD})["data"]["token"]

    cocktails = []
    page = 1
    while True:
        res = call(f"/cocktails?include=tags&per_page=100&page={page}", token=token)
        cocktails.extend(res["data"])
        if page >= res["meta"]["last_page"]:
            break
        page += 1

    proposals: dict[str, list[dict]] = {}
    unclassified: list[str] = []
    already = 0
    for c in cocktails:
        if any(t["name"].startswith("family:") for t in c.get("tags", [])):
            already += 1
            continue
        slug = c["slug"].removesuffix(f"-{BAR_ID}")
        verdict = classify([e["ingredient"]["name"] for e in c["ingredients"]])
        if verdict is None:
            unclassified.append(slug)
            continue
        family, reason = verdict
        proposals.setdefault(family, []).append(
            {"slug": slug, "name": c["name"], "reason": reason}
        )

    out = Path(__file__).parent / "family-proposals.json"
    out.write_text(
        json.dumps(
            {
                "_comment": "Heuristic DRAFT — review, move agreed slugs into "
                "family-assignments.json, rerun tag_families.py, then delete this file.",
                "proposals": {k: sorted(v, key=lambda d: d["slug"]) for k, v in sorted(proposals.items())},
                "unclassified": sorted(unclassified),
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )

    total = sum(len(v) for v in proposals.values())
    print(f"{already} already familied, {total} proposed, {len(unclassified)} unclassified")
    for family, items in sorted(proposals.items()):
        print(f"  {family}: {len(items)}")
    print(f"draft written to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
