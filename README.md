# Catalysis Screen — restored compounds dashboard

A static, read-only dashboard listing the reduced compounds tracked in
OdanLab, grouped by status/category, with structure thumbnails, yields and
links back to the source reactions.

It's plain HTML/CSS/JS — no build step, no backend. `index.html` reads
`data/molecules.json` and renders the cards; structure images live in
`assets/structures/`. `add.html` lets you draw/paste a structure that isn't
in OdanLab at all (see "Adding a structure by hand" below).

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

## Adding a structure by hand (not from OdanLab)

`add.html` ("+ Добавить структуру вручную" in the header) lets you add a
compound that isn't in OdanLab at all. If the embedded Ketcher editor is
set up (see "Встроенный Ketcher" below), you draw the structure directly
on the page and click **"Перенести структуру в форму ↓"** — no copying
SMILES by hand. Otherwise it falls back to pasting a SMILES string from
any structure editor that can export one (a link to EPAM's public
[Ketcher](https://lifescience.opensource.epam.com/KetcherDemoSA/index.html)
demo is right there, but MarvinJS, PubChem's sketcher, ChemDraw, whatever
you have all work the same way), rendered client-side via
[SmilesDrawer](https://github.com/reymond-group/smilesDrawer) (loaded from
jsDelivr — needs internet, same as the Google Fonts link already in
`index.html`).

### Встроенный Ketcher (draw directly on the page)

Getting SMILES back out of a drawn structure in JavaScript only works if
the editor runs on the **same domain** as the site (a browser security
rule — see Ketcher's own developer docs). Ketcher's public demo lives on
EPAM's domain, so it can't hand data back this way; self-hosting
Ketcher's own prebuilt static files fixes that, with no build step needed.
One-time setup:

1. Download Ketcher's standalone build: go to
   [github.com/epam/ketcher/releases/latest](https://github.com/epam/ketcher/releases/latest),
   expand **Assets**, and download the zip whose name contains
   "standalone" (e.g. `ketcher-standalone-X.Y.Z.zip`).
2. Unzip it, and copy its contents into a new `ketcher/` folder at the
   root of this repo, so `ketcher/index.html` exists (alongside its own
   asset files/folders).
3. Commit and push `ketcher/` to GitHub.

Until that folder exists, `add.html` quietly falls back to the
paste-a-SMILES flow described above (with a note explaining why) — nothing
breaks in the meantime.

**Where it's stored — shared via Supabase.** A static site has no backend
of its own, so drafts are stored in a small free
[Supabase](https://supabase.com) database instead of just the browser's
`localStorage`. That's what makes a structure someone else adds via
`add.html` show up for everyone who opens the site, not only in their own
browser. One-time setup (do this once per deployment):

1. Create a free project at [supabase.com](https://supabase.com) (needs a
   Supabase account — you or whoever administers this site does this, not
   every group member).
2. In that project's SQL Editor, run `supabase-schema.sql` from this repo —
   it creates the `drafts` table and the access policies described below.
3. In the project's Settings → API, copy the **Project URL** and the
   **anon public** key into `config.js` (replacing the `YOUR-PROJECT` /
   `YOUR-ANON-PUBLIC-KEY` placeholders), then commit and push.

Until `config.js` is filled in, `add.html` quietly falls back to
`localStorage` (same-browser-only, as before) so it isn't broken while you
set Supabase up — you'll see a warning on the page in that state.

Drafts show up on `index.html` with a dashed border and a "добавлено
вручную" badge. To promote one into the permanent, curated dataset (so it
shows up as a normal, non-dashed card in `data/molecules.json`): on
`add.html`, click **Экспорт** — it downloads a PNG (for
`assets/structures/`) and a JSON snippet shaped like one entry of
`data/molecules.json`. Add the PNG to `assets/structures/`, append the
snippet into `data/molecules.json`'s `molecules` array, commit and push (or
ask Claude to do it, same as an OdanLab refresh).

## Adding a structure by шифр (OdanLab reaction code)

Instead of drawing a structure from scratch, `add.html` has a **"Добавить по
шифру реакции из OdanLab"** box at the top: type a reaction's short code
(e.g. `AAP-36`, `EGZ-25`) and click **Найти**. If it's in the cache, the
name, reagent list, analytical yield **and structure picture** get pulled
into the form automatically — the preview fills in and "Добавить на сайт"
is enabled right away, with no need to draw or paste a SMILES at all. You
only need to pick a category (drawing/SMILES is still available above if
you'd rather supply your own structure instead of the cached picture).

**Why a cache, and why Claude can't just look it up live:** the sandbox
Claude runs in cannot reach this project's Supabase database directly over
the network (the same kind of outbound restriction that blocks `git push`
from there — see the git-based delivery workflow above). So instead of a
live lookup, the **whole OdanLab project's reaction list** (all ~149
reactions, not just the 21 currently tracked) is pre-loaded once into a
separate, read-only `odanlab_cache` table, and `add.html` queries *that*
table directly from your browser (which has normal internet access). This
table is not shown anywhere on the site — it only backs the "Найти" lookup.

One-time setup (in addition to the `drafts` table setup above): run
`odanlab-cache.sql` in Supabase's SQL Editor. It creates `odanlab_cache`
and bulk-inserts every reaction's code/name/reagents/yield **and structure
picture** (as a base64 SVG, pulled straight from OdanLab) known as of
generation time. The file is bigger than before (~1.7MB) because of the
pictures — still well within what Supabase's SQL Editor and free tier
handle fine. If you already ran an older version of this script, just
re-run the new one: it's migration-safe (adds the missing column instead
of erroring).

**Keeping the cache current:** ask Claude to regenerate `odanlab-cache.sql`
from OdanLab whenever you want the lookup to reflect new/changed reactions
(it re-derives every reaction's code from its OdanLab `display_id` and
overwrites the whole table via `truncate` + `insert` — safe, since this
table is just a lookup cache, never the source of truth for what's on the
site). Re-running it is the same "generate a file, paste it into Supabase's
SQL Editor" pattern as the original schema setup — not an automatic sync.

## Who can see and edit this site

This repo is public (required for free GitHub Pages), so the deployed site
is reachable by **anyone who has the URL** — it isn't gated by a login.
Two things soften that without adding real authentication:

- `robots.txt` and a `noindex` meta tag on every page tell search engines
  not to crawl or list it, so it won't turn up in Google etc. — it's
  reachable only by someone who already has the link.
- The Supabase **anon key** in `config.js` is, by design, not a secret
  (Supabase's model puts access control in the database's Row Level
  Security policies, not in hiding that key) — but with the policies in
  `supabase-schema.sql`, anyone who has the site link effectively also has
  that key, and so can add (and, as configured, delete) drafts, the same
  as viewing the page.

In short: this is "unlisted, share the link with your group" access, not
"only logged-in group members." That matches sharing a link with a small
lab group who won't stumble on it otherwise, but it does **not** stop
someone who has the link from adding junk data or deleting others' drafts.
If that turns out to matter, the next step up is adding real per-person
access — for example Supabase Auth (email/password or magic-link) with
policies scoped to `auth.uid()` instead of `anon`, or putting the whole
site behind Cloudflare Access / a hosting provider's password protection.
Ask Claude to set either of those up if you need it later.

## Categories

| # | Meaning |
|---|---|
| 1 | Есть препаративный выход — preparative (isolated) yield confirmed |
| 2 | Ожидает выделения — analytical yield only, isolation pending |
| 3 | Субстраты с низким аналитическим выходом — low analytical yield, substrate likely needs revisiting |
| 4 | Ожидает ЯМР / только запланировано — planned / no yield data yet |
