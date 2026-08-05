#!/usr/bin/env python3
"""Idempotent family-tag pipeline (ADR-002, frontend-spec §3).

Creates the reserved family:* tags in Bar Assistant and applies the
assignments in family-assignments.json by round-tripping each cocktail
through PUT /cocktails/{id} with its full payload (tags are update-only
upstream). Safe to re-run; reports slugs that match no cocktail.
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

API = os.environ.get("API_URL", "http://localhost:8000")
EMAIL = os.environ.get("SEED_EMAIL", "admin@example.com")
PASSWORD = os.environ.get("SEED_PASSWORD", "password")
TOKEN = os.environ.get("BARBACK_TOKEN")  # rotated instances: token beats password
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
        raw = res.read()
        return json.loads(raw) if raw else None


def to_ingredient_request(entry: dict) -> dict:
    out = {
        "ingredient_id": entry["ingredient"]["id"],
        "amount": entry["amount"],
        "units": entry["units"],
        "sort": entry.get("sort", 0),
        "optional": entry.get("optional", False),
        "is_specified": entry.get("is_specified", False),
        "amount_max": entry.get("amount_max"),
        "note": entry.get("note"),
    }
    subs = entry.get("substitutes") or []
    if subs:
        out["substitutes"] = [
            {
                "ingredient_id": s["ingredient"]["id"],
                "amount": s.get("amount"),
                "amount_max": s.get("amount_max"),
                "units": s.get("units"),
            }
            for s in subs
        ]
    return out


def main() -> int:
    assignments = json.loads(
        (Path(__file__).parent / "family-assignments.json").read_text()
    )
    assignments.pop("_comment", None)

    token = TOKEN or call(
        "/auth/login", "POST", {"email": EMAIL, "password": PASSWORD}
    )["data"]["token"]

    existing = {t["name"] for t in call("/tags", token=token)["data"]}
    for family in assignments:
        if family not in existing:
            call("/tags", "POST", {"name": family}, token=token)
            print(f"created tag {family}")

    misses: list[str] = []
    tagged = skipped = 0
    for family, slugs in assignments.items():
        for slug in slugs:
            try:
                cocktail = call(f"/cocktails/{slug}-{BAR_ID}", token=token)["data"]
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    misses.append(f"{slug} ({family})")
                    continue
                raise
            tag_names = [t["name"] for t in cocktail.get("tags", [])]
            if family in tag_names:
                skipped += 1
                continue
            payload = {
                "name": cocktail["name"],
                "instructions": cocktail["instructions"],
                "description": cocktail.get("description"),
                "source": cocktail.get("source"),
                "garnish": cocktail.get("garnish"),
                "glass_id": (cocktail.get("glass") or {}).get("id"),
                "method_id": (cocktail.get("method") or {}).get("id"),
                "year": cocktail.get("year"),
                "tags": tag_names + [family],
                "images": [i["id"] for i in cocktail.get("images", [])],
                "utensils": [u["id"] for u in cocktail.get("utensils", [])],
                "ingredients": [
                    to_ingredient_request(e) for e in cocktail.get("ingredients", [])
                ],
            }
            call(f"/cocktails/{cocktail['id']}", "PUT", payload, token=token)
            tagged += 1
            print(f"tagged {cocktail['name']} → {family}")

    print(f"\ndone: {tagged} tagged, {skipped} already tagged, {len(misses)} misses")
    if misses:
        print("no cocktail found for:")
        for m in misses:
            print(f"  - {m}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
