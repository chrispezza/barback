#!/usr/bin/env python3
"""Import a transcribed public-domain vintage book file into Bar Assistant.

Usage: python3 scripts/import_vintage.py scripts/vintage/thomas-1862.json

Each file carries draft2-shaped recipes plus a collection definition. Imports
are idempotent (duplicate_actions=skip, matched by lowercase name); the
collection is created if missing and updated with the imported cocktail ids.
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

API = os.environ.get("API_URL", "http://localhost:8000")
EMAIL = os.environ.get("SEED_EMAIL", "admin@example.com")
PASSWORD = os.environ.get("SEED_PASSWORD", "password")
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


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 1
    book = json.loads(Path(sys.argv[1]).read_text())

    token = call(
        "/auth/login", "POST", {"email": EMAIL, "password": PASSWORD}
    )["data"]["token"]

    imported_ids: list[int] = []
    for doc in book["recipes"]:
        name = doc["recipe"]["name"]
        result = call(
            "/import/cocktail",
            "POST",
            {"source": json.dumps(doc), "duplicate_actions": "skip"},
            token=token,
        )
        cocktail = (result or {}).get("data") or {}
        if cocktail.get("id"):
            imported_ids.append(cocktail["id"])
            print(f"imported {name} (id {cocktail['id']})")
        else:
            print(f"no id returned for {name} — check duplicates")

    meta = book["collection"]
    existing = call("/collections", token=token)["data"]
    match = next((c for c in existing if c["name"] == meta["name"]), None)
    if match:
        call(
            f"/collections/{match['id']}/cocktails",
            "PUT",
            {"cocktails": sorted(set(imported_ids) | {c["id"] for c in match.get("cocktails", [])})},
            token=token,
        )
        print(f"updated collection {meta['name']}")
    else:
        call(
            "/collections",
            "POST",
            {
                "name": meta["name"],
                "description": meta.get("description"),
                "is_bar_shared": True,
                "cocktails": imported_ids,
            },
            token=token,
        )
        print(f"created collection {meta['name']} with {len(imported_ids)} recipes")

    print("\nRe-run bar:refresh-search or wait for scout sync to index for search.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
