# RepTime Lookup

A static single-page web app that turns two community-maintained JSON
databases into an instant search:

- type a watch (e.g. `Submariner 116610LN`, `Daytona`, `Patek Aquanaut 5167`,
  `PAM 005`)
- get the **best factory** (with NWBIG / Super Rep tier) and the
  **top 3 trusted dealers** to source it from

No build step, no dependencies, no backend. Deployed via GitHub Pages.

## Run locally

```bash
cd app
python3 -m http.server 8000
```

Open <http://localhost:8000/>.

The page works offline once loaded — both JSONs live in browser memory.
Hard-refresh (`Cmd-Shift-R`) after a data refresh to pick up changes.

## Refresh the data

The reptime.help-derived JSON refreshes **automatically every month**
via [`.github/workflows/refresh.yml`](.github/workflows/refresh.yml). It
re-scrapes the five source pages, rebuilds `reptime-help.json`, and
commits the result if anything changed. GitHub Pages then auto-redeploys.

To trigger a refresh on demand (without waiting for the schedule), run it
locally:

```bash
bash refresh.sh
```

Or use the **Run workflow** button on the Actions tab in GitHub.

The spreadsheet-derived JSON (`who-makes-the-best-guide.json`) is regenerated
manually whenever the source `.xlsx` files change. The conversion script
writes directly into this folder:

```bash
cd /Users/zabrisket/Documents/Perplexity
python3 convert_to_json.py    # → app/who-makes-the-best-guide.json
cd app
git add who-makes-the-best-guide.json && git commit -m "Refresh spreadsheet data" && git push
```

## Browsing & images

Open the app with no search query and you'll see a **browse grid** — every
brand → model family as a card, with a brand-chip filter at the top. Click a
family card to drill into a detail page that lists every variant with its
best-factory + dealer recommendations.

### Adding photos

Image lookup is opt-in via `app/images.json`. The lookup chain is **most-
specific wins**: per-watch → per-family → per-brand → striped placeholder.

```json
{
  "rolex-submariner-126610ln-126610lv-126619lb": "img/sub-126610ln.jpg",
  "rolex--submariner": "img/sub-family.jpg",
  "patek-philippe--nautilus": "https://upload.wikimedia.org/.../Nautilus.jpg",
  "rolex": "img/rolex-fallback.jpg"
}
```

| Key shape | Granularity | Example |
|---|---|---|
| `<brand>-<family>-<reference>` | Single watch (one variant) | `rolex-submariner-126610ln-126610lv-126619lb` |
| `<brand>--<family>` (note **double** dash) | All variants in a model family | `rolex--submariner` |
| `<brand>` | Catch-all per brand | `rolex` |

- Keys are auto-slugified — punctuation stripped, lowercased
  (e.g. `Patek Philippe` → `patek-philippe`).
- Values are either a relative path under `app/` (drop a JPG into `app/img/`)
  or any absolute URL.
- Missing or 404 images degrade silently to a striped placeholder showing the
  brand name. Every family detail page also exposes a
  "See photos on Google Images →" link as a universal fallback.

To find a watch's id, open its result/variant card and inspect its
`data-id` attribute in DevTools, or use the browser console:
```js
state.watches.find(w => /126610LN/.test(w.reference)).id
```
For a family slug, right-click a card on the browse grid → Copy link.
The `#family/<slug>` portion is the key to use.

## How matching works

- The two who-makes-the-best lists are merged into one deduped index keyed by
  brand + family + normalized reference tokens. Same watch, same factory? The
  recommendations are unioned and the higher tier wins.
- Queries are tokenized on whitespace, commas, slashes, dashes and parens, so
  `126610LN/LV/LB` and `126610LN, 126610LV, 126619LB` match the same row.
- Score: +5 per exact token hit, +3 per substring hit (≥3 chars), +2 brand
  bonus, +1 family bonus. Ties broken by NWBIG > Super Rep > untiered.
- Dealer ranking: forum-vetting score (RWI=3, RepGeek=2, RWG=1). Top tier
  (`RWI REPGEEK RWG`, score 6) is always shown first.

## File layout

```
.
├── index.html                       — shell with search box, browse grid, family-detail panel
├── app.js                           — all logic (load, dedupe, tokenize, score, render, route)
├── styles.css                       — brutalist dark UI, no framework
├── images.json                      — optional watch/family/brand → image URL map
├── img/                             — local images referenced from images.json
├── who-makes-the-best-guide.json    — spreadsheet-derived watch DB (manually refreshed)
├── reptime-help.json                — reptime.help-derived DB (auto-refreshed monthly)
├── build_reptime_help_db.py         — scrapes reptime.help into the JSON above
├── refresh.sh                       — local convenience wrapper for the build script
├── reptime_html/                    — HTML cache (git-ignored)
├── .github/workflows/refresh.yml    — monthly auto-refresh + commit
└── README.md                        — this file
```

## Troubleshooting

- **"Failed to load data" banner.** The fetch failed. Run `python3 -m http.server`
  inside this folder and open `http://localhost:8000/` — opening `index.html`
  directly with `file://` will fail because of browser CORS.
- **Stale results after a refresh.** Hard-reload the page. The browser may
  cache the JSON.
- **A factory has no specialty / description in the modal.** That code isn't
  in the reptime.help glossary or major-factories list; the modal still shows
  database-derived stats.
- **Manual refresh on the live site.** Open the **Actions** tab on GitHub
  → "Refresh reptime-help.json" → **Run workflow**. Takes ~30 seconds; if
  the data changed, it commits and Pages redeploys automatically.
