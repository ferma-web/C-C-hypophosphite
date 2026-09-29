#!/usr/bin/env python3
"""
Refresh data/molecules.json (and assets/structures/*.png) from OdanLab.

STATUS: this is a scaffold, not a finished integration. It was generated
without access to OdanLab's public REST API docs — the reaction/substance
data in this repo was exported once, by hand, through a private session tool
that is NOT available to a script running in GitHub Actions or in a
visitor's browser.

Before this script can actually talk to OdanLab, you need to get from
OdanLab (ask their team / check their developer docs):

  1. A public API base URL (this script guesses
     "https://lab.odanchem.org/api/v1" below — CONFIRM this).
  2. An auth scheme: most likely an API token sent as a header, e.g.
     "Authorization: Bearer <token>" or "X-Api-Key: <token>".
     Generate a token scoped to read-only access to this one project if
     OdanLab supports scoping.
  3. Confirmation that the token is safe to use from a server-side script
     (GitHub Actions) — do NOT put a real OdanLab token in client-side JS
     (script.js) or commit it to the repo; it would be visible to anyone
     who opens the site or the git history.

Once you have that:
  - Store the token as a GitHub Actions secret named ODANLAB_API_TOKEN
    (repo Settings -> Secrets and variables -> Actions).
  - Fill in the request logic below (GROUP_ID / PROJECT_ID are already
    correct — they're public identifiers baked into the reaction links).
  - Enable the "refresh-data" workflow (currently left as a manual-only
    workflow_dispatch trigger in .github/workflows/refresh-data.yml so it
    doesn't fail every night until this script is finished).

Until then, update data/molecules.json manually (or re-run whatever export
process produced it) and commit the change — the site itself is 100%
static and just reads that JSON file, so any valid file works.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error

GROUP_ID = "25214cf7-ea57-4a35-bfd1-167ad307f306"
PROJECT_ID = "4e03047f-ba01-4986-8f9b-c077ed367195"

# TODO: confirm with OdanLab and adjust.
API_BASE = os.environ.get("ODANLAB_API_BASE", "https://lab.odanchem.org/api/v1")
API_TOKEN = os.environ.get("ODANLAB_API_TOKEN")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_OUT = os.path.join(REPO_ROOT, "data", "molecules.json")
IMAGES_OUT = os.path.join(REPO_ROOT, "assets", "structures")

# The "molecules" collection this site renders is a curated subset (reduced
# compounds worth tracking on the dashboard), not literally every reaction
# in the project. How you decide which reactions/substances qualify is up
# to your own workflow -- this script only shows the mechanical part
# (talk to the API, write the JSON in the shape script.js expects).


def api_get(path, params=None):
    if not API_TOKEN:
        raise RuntimeError(
            "ODANLAB_API_TOKEN is not set. See the module docstring: this "
            "script cannot run until OdanLab's public API + token scheme "
            "is confirmed and stored as a GitHub Actions secret."
        )
    url = f"{API_BASE}{path}"
    if params:
        from urllib.parse import urlencode
        url += "?" + urlencode(params)
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {API_TOKEN}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def fetch_reactions():
    """TODO: replace with the real list-reactions call for GROUP_ID/PROJECT_ID."""
    # Example shape, once the real endpoint is known:
    # return api_get(f"/groups/{GROUP_ID}/projects/{PROJECT_ID}/reactions")
    raise NotImplementedError("Wire this up once OdanLab's API is confirmed.")


def download_image(url, dest_path):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as resp:
        with open(dest_path, "wb") as f:
            f.write(resp.read())


def build_molecules(reactions):
    """Map raw API reaction/substance records into the site's JSON schema:
    {id, category, name, formula, cas, loading_umol, yield_analyt,
     yield_iso, note, reactions:[{code,id}], image}
    Category numbers (1-4) mirror the Google Sheet / dashboard convention:
      1 = has a preparative (isolated) yield
      2 = analytical yield only, isolation pending
      3 = low analytical yield, substrate likely needs revisiting
      4 = reaction planned / no yield data yet
    This mapping is currently manual (see the note above) -- adjust once
    you decide how a reaction should be classified automatically, or keep
    doing this step by hand and just use this script for the mechanical
    "pull + download images + write JSON" part.
    """
    raise NotImplementedError("Implement once fetch_reactions() is real.")


def main():
    reactions = fetch_reactions()
    molecules = build_molecules(reactions)

    os.makedirs(IMAGES_OUT, exist_ok=True)
    payload = {
        "meta": {
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": "OdanLab API",
            "count": len(molecules),
        },
        "molecules": molecules,
    }
    with open(DATA_OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"wrote {len(molecules)} molecules to {DATA_OUT}")


if __name__ == "__main__":
    try:
        main()
    except NotImplementedError as e:
        print(f"refresh_data.py is a scaffold, not finished yet: {e}", file=sys.stderr)
        sys.exit(1)
