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

`data/molecules.json` is a plain checked-in file — the site itself has no
connection to OdanLab and never will (it's static HTML served to anyone's
browser, so it can't hold a credential safely). Data gets into it via
**Claude, using the OdanLab connector**, not via a public OdanLab API:
there isn't a confirmed one, and even if there were, putting its token in
`script.js` would expose it to every visitor.

The refresh flow in practice:

1. In a Claude chat that has this repo and the OdanLab connector, ask
   Claude to refresh the site's data. Claude pulls the current state of
   every reaction listed in `data/molecules.json` (it already has their
   IDs) via `mcp__OdanLab__get_reaction`, and writes a small
   `{code: {yield_analyt, yield_iso, mass_measured, melt_point, cas}}`
   JSON.
2. `scripts/refresh_data.py <that file>` merges it into
   `data/molecules.json` (updates numbers for compounds already tracked;
   see the script's docstring — it doesn't invent new compounds or decide
   their category on its own).
3. Commit and push — GitHub Pages redeploys automatically.

Ask Claude to do all three steps in one go ("refresh the site from OdanLab
and push it"), or ask it to set up a recurring scheduled task if you want
this to happen automatically on a cadence (daily/weekly) instead of only
when you ask.

Adding a genuinely new compound (not just refreshing numbers) still needs a
person (or Claude, told which category it belongs in) to pick a category
and provide/confirm a structure image — that's a judgment call `refresh_data.py`
deliberately leaves alone.

The JSON shape either way:

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
