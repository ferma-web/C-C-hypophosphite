#!/usr/bin/env python3
"""
Merge a fresh OdanLab pull into data/molecules.json.

This does NOT call OdanLab itself. There is no confirmed public OdanLab
REST API this script (or GitHub Actions, or a visitor's browser) could call
directly and safely — see the README for why. The data actually gets
pulled by Claude, inside a chat that has the OdanLab connector enabled,
using its `mcp__OdanLab__get_reaction` tool. That's a deliberate choice:
the OdanLab session is tied to your account and only usable from inside
that chat, so nothing ever has to hold a bare OdanLab credential that a
public GitHub Pages site could leak.

The refresh recipe is:

  1. In a Claude chat with the OdanLab connector, ask Claude to pull the
     latest state of the tracked reactions (Claude already knows their IDs
     from data/molecules.json's "reactions" field) and write the results
     to a small JSON file shaped like:

       {
         "AAP-36": {"yield_analyt": 61, "yield_iso": 72,
                     "mass_measured": 72, "melt_point": null, "cas": ""},
         "KIR-46": {...},
         ...
       }

     keyed by the reaction's short code (e.g. "AAP-36"), one entry per
     reaction referenced in data/molecules.json.

  2. Run this script to merge that file into data/molecules.json:

       python3 scripts/refresh_data.py fresh_pull.json

  3. Commit and push data/molecules.json (and any new/changed files under
     assets/structures/ if a new compound was added) — GitHub Pages
     redeploys automatically (.github/workflows/pages.yml).

In practice, just ask Claude to "refresh the site's data from OdanLab and
push it" in a chat that has this repo open — steps 1-3 are what it will
do. A recurring Claude scheduled task can also run this on a cadence
(daily/weekly) if you want it automatic; ask Claude to set that up.

Adding a brand-new compound (not just refreshing numbers for ones already
tracked) additionally needs a category assignment (1-4, see README) and a
structure image — that part stays a judgment call, not something this
script infers on its own.
"""

import json
import sys
import datetime
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(REPO_ROOT, "data", "molecules.json")


def main():
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <fresh_pull.json>", file=sys.stderr)
        sys.exit(1)

    with open(DATA_PATH, encoding="utf-8") as f:
        payload = json.load(f)
    with open(sys.argv[1], encoding="utf-8") as f:
        fresh = json.load(f)

    changed = 0
    missing_codes = []
    for m in payload["molecules"]:
        codes = [r["code"] for r in (m.get("reactions") or [])]
        if not codes:
            continue
        code = codes[0]
        fr = fresh.get(code)
        if not fr:
            missing_codes.append(code)
            continue
        before = (m.get("yield_analyt"), m.get("yield_iso"), m.get("mass_measured_mg"), m.get("melt_point_c"))
        m["yield_analyt"] = fr.get("yield_analyt")
        m["yield_iso"] = fr.get("yield_iso")
        m["mass_measured_mg"] = fr.get("mass_measured")
        m["melt_point_c"] = fr.get("melt_point")
        if fr.get("cas"):
            m["cas"] = fr["cas"]
        after = (m.get("yield_analyt"), m.get("yield_iso"), m.get("mass_measured_mg"), m.get("melt_point_c"))
        if before != after:
            changed += 1

    payload["meta"]["generated_at"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    payload["meta"]["source"] = "OdanLab (pulled via Claude's OdanLab connector)"

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"updated {changed} of {len(payload['molecules'])} molecules")
    if missing_codes:
        print(f"no fresh data supplied for: {', '.join(missing_codes)}", file=sys.stderr)


if __name__ == "__main__":
    main()
