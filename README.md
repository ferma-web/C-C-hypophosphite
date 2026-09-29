# Catalysis Screen — restored compounds dashboard

A static, read-only dashboard listing the reduced compounds tracked in
OdanLab, grouped by status/category, with structure thumbnails, yields and
links back to the source reactions.

It's plain HTML/CSS/JS — no build step, no backend. `index.html` reads
`data/molecules.json` and renders the cards; structure images live in
`assets/structures/`.

## Run it locally

Any static file server works, e.g.:

```
python3 -m http.server 8000
```

then open `http://localhost:8000`. (Opening `index.html` directly via
`file://` won't work — the browser blocks the `fetch()` of
`data/molecules.json` from a local file.)

## Deploy to GitHub Pages

1. Push this repo to GitHub (`git push origin main` — this working copy is
   already committed).
2. In the repo's Settings → Pages, set "Source" to **GitHub Actions** (the
   `.github/workflows/pages.yml` workflow in this repo does the rest — it
   deploys on every push to `main`).
3. The site will be live at `https://<your-username>.github.io/<repo>/`.

## Updating the data

`data/molecules.json` is a plain checked-in file — the site has no
knowledge of where it came from. Today it holds a one-time export (21
compounds) pulled from OdanLab by hand.

`scripts/refresh_data.py` is a **scaffold** for automating that export, not
a finished integration — read the docstring at the top of that file. In
short: it needs OdanLab's public API base URL and an auth token scheme,
neither of which were available to build this repo. Once you confirm those
with OdanLab:

1. Finish `fetch_reactions()` / `build_molecules()` in
   `scripts/refresh_data.py`.
2. Add the token as a GitHub Actions secret named `ODANLAB_API_TOKEN`
   (Settings → Secrets and variables → Actions).
3. Switch `.github/workflows/refresh-data.yml` from manual
   (`workflow_dispatch`) to a schedule, e.g.:
   ```yaml
   on:
     schedule:
       - cron: "0 6 * * *"
     workflow_dispatch: {}
   ```

That keeps the OdanLab credential server-side (inside the Action), which is
the only safe place for it — a token embedded in `script.js` would be
visible to anyone who views the page source, since GitHub Pages serves
static files with no way to hide secrets from the browser.

Until that's wired up, just re-run whatever process produced
`data/molecules.json` (or edit it by hand) and commit — the site picks up
any valid file in the same shape:

```json
{
  "meta": { "generated_at": "...", "source": "...", "count": 21 },
  "molecules": [
    {
      "id": "unique-id",
      "category": 1,
      "name": "...",
      "formula": "...",
      "cas": "...",
      "loading_umol": 500,
      "yield_analyt": 61,
      "yield_iso": 72,
      "note": "",
      "reactions": [{ "code": "AAP-36", "id": "reaction-uuid" }],
      "image": "assets/structures/<id>.png"
    }
  ]
}
```

## Categories

| # | Meaning |
|---|---|
| 1 | Есть препаративный выход — preparative (isolated) yield confirmed |
| 2 | Ожидает выделения — analytical yield only, isolation pending |
| 3 | Субстраты с низким аналитическим выходом — low analytical yield, substrate likely needs revisiting |
| 4 | Ожидает ЯМР / только запланировано — planned / no yield data yet |
