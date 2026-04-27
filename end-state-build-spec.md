# RepTime Lookup — End-State Build Spec

> **For a coding agent.** This describes the polished, publish-ready version of the site. It is intentionally product-and-design-led, not implementation-heavy: the spec calls out *what the user sees, hears, and can do*, the data model needed to make that real, and the constraints that keep it shippable.
>
> The current version (v1, live at <https://zabrisket.github.io/reptime-lookup/>) is the starting line, not the deliverable. Where this spec contradicts v1, this spec wins.

---

## 1. Vision in one paragraph

RepTime Lookup is a **research and shopping-discovery tool** for replica watch enthusiasts. It answers three questions, in order: (1) *which watch?*, (2) *which factory makes the best replica of it?*, (3) *which trusted dealer should I buy from, at what price, and where exactly is it on their site?* The end-state site delivers all three with the visual rigor and information density of a Bloomberg terminal, the typographic discipline of a brutalist art book, and the conversion-funnel clarity of a comparison shopping site. Users come for a recommendation; they leave with a curated list of three dealer offers, complete with prices, photos, and stock status, ready to click through to buy.

---

## 2. Design language

The current brutalist monochrome direction is **correct and should be deepened, not abandoned**. The replica market is gray-area; pretending to be Amazon would be dishonest and the visual mismatch would corrode trust. The mono terminal aesthetic reads as "honest research tool" — keep it.

**What to keep:**
- Mono surfaces (`#0a0a0a` page, `#141414` cards), square corners, dotted-grid background.
- `ui-monospace` typography throughout (JetBrains Mono, IBM Plex Mono fallbacks).
- Forum-vetted accent colors: NWBIG amber, Super Rep green. No other colors except `--fg`, `--fg-mute`, `--fg-dim`, `--line`, `--line-strong`.
- `[ BRACKETED ]` chip and button affordance. `// PREFIX` section labels.

**What to add:**
- A consistent **8 px baseline grid** for vertical rhythm. Tighten visual alignment across all components — current v1 has minor drift.
- A typographic scale: `9, 10, 11, 12, 13, 14, 18, 24, 32` px. Nothing outside this scale.
- A real **image frame** treatment: 1 px border, dark inset shadow, 4:3 aspect ratio enforced by `aspect-ratio` CSS, `object-fit: contain` on a `#0a0a0a` background. Watch photos look like they're floating in a vitrine.
- Subtle **micro-interactions**: 80ms transitions on hover/focus, 200ms on view changes. No bounce, no springs. Reduced-motion media query disables all of them.
- A **status-stripe pattern** — diagonal pinstripe on `--fg-dim` — used for placeholders and "loading…" states. Same pattern as v1's image placeholder, used systemically.

---

## 3. Information architecture

```
/                           Home (browse + search)
/#search?q=…                Search results (state in URL hash)
/#family/<id>               Family detail (e.g. rolex--submariner)
/#watch/<id>                Watch detail (e.g. rolex-submariner-126610ln-…)  ← NEW
/#dealer/<id>               Dealer detail (e.g. theonewatches)               ← NEW
/#factory/<code>            Factory detail (e.g. CLEAN, VSF, ARF)            ← NEW (currently modal)
/#compare?ids=A,B,C         Side-by-side comparison                          ← NEW (optional v2.1)
/#about                     About, disclaimers, methodology, contact         ← NEW
```

All routes are hash-based (no server). Browser back/forward works. Each route renders a single `<main>` view with shared header/footer.

---

## 4. Page-by-page specifications

### 4.1 Home (`/`)

The first impression. Three regions, top to bottom:

**Header** — `REPTIME LOOKUP // 485 RECORDS // V2`. Permanent across all pages.

**Search hero** — Large mono input with placeholder cycling between real example queries (`SUBMARINER 126610LN`, `DAYTONA STEEL`, `PATEK 5167`, `PAM 005`). Dropdown autocomplete shows 5 best matches under the input as the user types, each with brand · family · ref · best-factory pill. ↑/↓ navigates, Enter opens the watch detail page (or family detail for partial matches). On focus-out without selection, the user lands on `/#search?q=…`.

**Browse rail** — Brand chips followed by a family grid (cards described in §5). Adds a **filter sidebar** on desktop (collapses to a sticky bar on mobile):

- Brand (multi-select, current chip behavior)
- Best-factory tier: `[ ANY ] [ NWBIG ONLY ] [ SUPER REP+ ]`
- Price range: dual-handle slider, `$200 – $5,000+`, "any" by default
- Stock: `[ ANY ] [ IN STOCK NOW ]`
- Sort: `[ POPULARITY ] [ PRICE ASC ] [ PRICE DESC ] [ NEWEST DATA ]`

Active filters render as removable chips above the grid. URL hash carries filter state so a filtered view is shareable.

**Empty state** (no families match): mono caption — `// NOTHING MATCHES THESE FILTERS` — with a `[ RESET ]` button.

### 4.2 Search (`/#search?q=…`)

Identical chrome to home but the family grid is replaced by **watch result cards** ranked by the existing scoring algorithm. Each card shows:

- Hero image (from the top dealer offer; fall through chain in §6)
- Brand · family · ref · movement
- Best factory + tier pill
- Lowest available price, dealer name in small caps: `FROM $4,200 ON THEONEWATCHES`
- `[ VIEW ]` CTA → watch detail page

Auto-expand the top result if its score is ≥2× the next.

### 4.3 Family detail (`/#family/<id>`)

The "model overview" page. Sections:

1. **Hero strip**: large family image (aspect 16:9), brand · family · variant count · most-recommended factory.
2. **About this family**: short prose paragraph (sourced from a new `family-blurbs.json` — see §10). 2-3 sentences max. If absent, hide section. Examples: *"The Rolex Submariner 126610LN is the modern 41 mm steel sports diver, replacing the 116610 in 2020. NWBIG-tier replicas use the Clean Plus DD3235 movement."*
3. **Variant grid**: cards for each variant (reference + movement), each linking to the watch detail page. Variant cards show: ref, movement, best factory, tier pill, lowest dealer price.
4. **Where it's stocked**: a horizontal scroll of dealer thumbnails with their inventory count for this family. Click → dealer detail.
5. **Community notes**: any reptime.help notes about the family ("no good rep yet", "production paused", etc.) shown as a callout.

### 4.4 Watch detail (`/#watch/<id>`) — the marquee page

This is the biggest jump from v1. Today, dealer info is just three text rows inside a search-result card. In the end-state, the watch detail page is the destination — the place users spend time, where the conversion happens.

Layout (desktop):

```
┌────────────────────────────────────────────────────────────────────┐
│ [BACK TO FAMILY]                                                   │
│                                                                    │
│ ┌──────────────────────────┐ ┌──────────────────────────────────┐ │
│ │                          │ │ ROLEX // SUBMARINER              │ │
│ │     Image carousel       │ │ 126610LN  ·  Clean Plus DD3235   │ │
│ │      (4:3, 5 angles)     │ │                                   │ │
│ │                          │ │ [ NWBIG ]  Best factory: Clean   │ │
│ │  • • • • •               │ │                                   │ │
│ │                          │ │ // SPECS                          │ │
│ │  Source: theonewatches   │ │ Case        41 mm steel          │ │
│ └──────────────────────────┘ │ Bezel       Cerachrom (black)    │ │
│                              │ Movement    Clone DD3235          │ │
│                              │ Movement #  Clean Plus            │ │
│                              │ Sources     Spreadsheet + reptime │ │
│                              └──────────────────────────────────┘ │
│                                                                    │
│ // 3 TRUSTED DEALER OFFERS                          sort: PRICE ↑  │
│                                                                    │
│ ┌─#1───────────────────────────────────────────────────────────┐  │
│ │ ┌─img─┐  THEONEWATCHES         RWI · REPGEEK · RWG           │  │
│ │ │     │  Submariner 126610LN…   $379 USD     [ IN STOCK ]    │  │
│ │ │     │                          ↻ 2 days ago                 │  │
│ │ └─────┘                                       [ VIEW ON SITE ]│  │
│ └──────────────────────────────────────────────────────────────┘  │
│ ┌─#2─ … same shape, JTime …────────────────────────────────────┐  │
│ ┌─#3─ … same shape, Toro Bravo …───────────────────────────────┐  │
│                                                                    │
│ [ SHOW ALL 33 DEALERS ]                                            │
│                                                                    │
│ // FACTORY ALTERNATIVES                                            │
│ #1 Clean      [ NWBIG ]   Specialty: Submariner. ⓘ                │
│ #2 VSF        [ SUPER ]   Specialty: high-end steel sports. ⓘ     │
│ #3 ZF         [ SUPER ]   Specialty: discontinued series. ⓘ       │
│                                                                    │
│ // NOTES                                                           │
│ Community: "Clean Plus DD3235 is the consensus pick post-2023."    │
│                                                                    │
│ // PRICE HISTORY                                                   │
│ ▁▁▂▂▃▄▅▆▆▇  $349 → $379 over last 8 weeks (theonewatches)         │
└────────────────────────────────────────────────────────────────────┘
```

Mobile collapses to a single column with the carousel above the title block. Dealer offers stack vertically with the image on the left.

**Dealer-offer card behavior**:
- Sort by `price asc | rank | last-updated`. Default: `rank` (forum-vetting score, like v1).
- "In stock" badge derived from scraped page (see §7).
- Each price shows the dealer's stated currency with USD-equivalent in small caps if not USD.
- "↻ X days ago" reflects last successful catalog scrape; turns amber if >14 days, red if >30.
- `[ VIEW ON SITE ]` is the final CTA. This is the same resolver shipped in v1: direct → search → home, but now "direct" is the default for any (watch, dealer) pair the catalog scraper found, not a hand-curated list.
- Click on dealer name → dealer detail page.

**Image carousel**: scrapes 1–6 product photos from the chosen dealer (the highest-scored dealer with this watch in stock). Shows up to 5; thumbnails below; arrow keys navigate; lightbox on click for full-size. Source attribution is permanent: `Source: theonewatches` in caption — this is both honest and protects against trademark-confusion claims.

**Empty / degraded states**:
- No dealer offers found: `// NO DEALER OFFERS IN CATALOG. FALL BACK TO SEARCH ON 33 TRUSTED DEALERS.` + the v1 dealer rows beneath, which deep-link via search URL.
- No images: stripe placeholder with brand · family text overlay (current v1 fallback).
- All dealer scrape data >30 days old: amber banner, `// CATALOG DATA IS STALE. PRICES MAY BE OUT OF DATE.`

### 4.5 Dealer detail (`/#dealer/<id>`)

Profile page for a trusted dealer. Sections:

1. **Header**: dealer name, forum vetting badges, score, optional logo. Contact rail: `[ WEBSITE ] [ WHATSAPP ] [ EMAIL ] [ TELEGRAM ]` (only those they have).
2. **Stats strip**: `IN OUR DB: 142 WATCHES · MEDIAN PRICE: $420 · LAST SCRAPED: 2 DAYS AGO`.
3. **Their inventory**: filterable grid of every watch from our DB they currently stock, with image + price + ref. Clicks land on the watch detail page (not the dealer's site).
4. **About**: short prose blurb if available, plus any reptime.help notes.

### 4.6 Factory detail (`/#factory/<code>`)

Today this is a small modal. Promote to a full page.

1. **Header**: factory code (e.g. `CLEAN`), display name, specialty.
2. **What they're best at**: list of watches where they hold rank #1 in our DB, with images.
3. **Tier distribution**: how many of their watches are NWBIG vs Super Rep vs untiered.
4. **Glossary**: long-form description from `reptime.help` glossary if available.

### 4.7 About (`/#about`)

A real about page. Plain text, no images. Sections:

- What this site is and isn't (tool, not retailer).
- Where data comes from (reddit wiki spreadsheet + reptime.help, both community-maintained, scraped on schedule).
- How recommendations are made (forum scores, factory rankings) — non-mystery; show the methodology.
- **Disclaimers**: replicas are gray-market; this site doesn't sell anything; users transact at their own risk; no affiliation with brands.
- DMCA / takedown contact.
- Last data refresh timestamp.
- Open-source link to the GitHub repo.

---

## 5. Cross-cutting components

These appear on multiple pages and need to look identical wherever they show up.

### 5.1 Watch card (used in search results, family-variant grid, dealer inventory)

```
┌────────────────────────────────────┐
│         [ image, 4:3 ]             │
├────────────────────────────────────┤
│ ROLEX                              │
│ SUBMARINER 126610LN                │
│ Clean DD3235  [ NWBIG ]            │
│ FROM $379 ON THEONEWATCHES         │
└────────────────────────────────────┘
```

Hover: 1 px border lifts to `--line-strong`. No scale/translate (brutalist).

### 5.2 Family card (browse grid)

Same as v1 but enforce the new image frame and add `FROM $XXX` to the meta line.

### 5.3 Dealer-offer card (watch detail)

Described in §4.4. The single most important new component on the site. Triple-column on desktop (image | text | CTA), stacks on mobile.

### 5.4 Tier pill

Three states: `NWBIG` (amber), `SUPER REP` (green), absent (no pill). Always uppercase, `0.16em` letter-spacing, `9px`, square corners, 1 px border in the same color.

### 5.5 Image frame

Universal wrapper for all product photos. 1 px `--line` border, `--surface-deep` (`#0a0a0a`) background, `aspect-ratio: 4/3`, `object-fit: contain`, lazy-loaded, with the striped placeholder as fallback. Corner caption (`Source: <dealer>`) on dealer-sourced images, hidden in compact contexts (cards), shown on detail pages.

### 5.6 Search input + autocomplete

Mono input, `[ ]` brackets as decoration, autocomplete dropdown 5 items. Items have keyboard nav, mouse hover state, and a footer row: `[ ENTER → ALL RESULTS ]`. Dropdown appears below input on a darker `--surface-deep` background with the same dotted-grid texture.

### 5.7 Price block

```
$379 USD             ← primary, mono, 18px
≈ ¥2,720             ← secondary, fg-dim, 11px, only if not USD
↻ 2 days ago         ← tertiary, fg-dim, 9px
```

USD as canonical; dealer's stated currency in secondary if different. Convert via a quarterly-refreshed `fx-rates.json` (no live API — we don't need real-time accuracy for replica pricing).

### 5.8 Forum badges

Three uppercase 9px pills: `RWI`, `REPGEEK`, `RWG`. Always shown in score order.

---

## 6. Image sourcing and fallback chain

For any (watch) image, resolve in order:

1. **Curated override** — `images.json` (already exists, currently empty). User-uploaded local file in `app/img/`.
2. **Top dealer offer** — first image scraped from the highest-ranked dealer that has this watch in stock.
3. **Other dealer offers** — same, fall through dealers in score order.
4. **Family image** — if any variant of the family has a dealer image, reuse it.
5. **Brand placeholder** — striped placeholder with brand label.

Image URLs are stored as-is from the dealer's CDN; we don't rehost. This is bandwidth-respectful and avoids storage cost. Browser caches them. If a URL goes 404, the `onerror` handler swaps in the next fallback in the chain. (The v1 `buildImageSlot` helper already does the swap — extend it to walk the new chain.)

For the watch-detail carousel, scrape up to 6 images per (watch, dealer) and store a `gallery` array.

**Legal posture**: hot-linking dealer images is generally tolerated — they want clicks. Footer disclaimer + per-image `Source: <dealer>` caption + DMCA contact in About covers the residual risk.

---

## 7. The data layer (concept, not architecture)

The end-state introduces **one new data file** that drives the price/image/stock features:

`app/dealer-catalog.json`:

```json
{
  "_doc": "Auto-generated by the catalog scraper. Re-run weekly via GitHub Action.",
  "scraped_at": "2026-04-26T03:17:00Z",
  "offers": {
    "rolex-submariner-126610ln-126610lv-126619lb": {
      "theonewatches": {
        "url": "https://www.theonewatches.ws/index.php?route=product/product&product_id=20201",
        "title": "Submariner 126610LN 41mm SS/SS Black Dial Clean Plus DD3235",
        "price": 379,
        "currency": "USD",
        "in_stock": true,
        "images": ["https://…/1.jpg", "https://…/2.jpg", "..."],
        "scraped_at": "2026-04-26T03:17:00Z"
      },
      "trusty-time": { "...": "..." }
    }
  }
}
```

Three things to note:
- It's **flat and append-only per scrape**. Easy to diff. Easy to regenerate.
- It **replaces** the hand-curated `dealer-deep-links.json` shipped in v1 — the scraper emits direct URLs, no manual curation needed (but `dealer-deep-links.json` stays as an override layer for cases the scraper misses).
- The existing `dealer-search.json` stays as the **fallback** when the catalog has no offer for a (watch, dealer) pair.

Resolver order at render time (extension of v1's chain):

1. `dealer-catalog.json` offer → `kind: "direct"` with full price/image/stock metadata
2. `dealer-deep-links.json` override → `kind: "direct"`, no metadata
3. `dealer-search.json` template → `kind: "search"`
4. Dealer homepage → `kind: "home"`

A separate `app/price-history.json` snapshots `{watch_id}.{dealer_id} → [{date, price}]` weekly so the watch-detail page can render a sparkline.

Both files are produced by a scheduled GitHub Action (same pattern as the existing `refresh.yml`). The action runs Playwright headless to bypass Cloudflare on the few sites that need it. Failed dealers are logged but do not fail the run; partial data is shipped.

---

## 8. States — every page must specify these

For each page above, the agent must implement **all four**:

1. **Loading**: striped-placeholder skeleton matching the final layout. No spinners.
2. **Loaded**: the spec'd content.
3. **Empty**: zero matches / zero offers. Always offer a recovery action.
4. **Error**: catalog missing, JSON parse failed, network down. Show `// DATA UNAVAILABLE` banner + recovery CTA. Never leave a blank page.

The data fetch helpers in v1 (`fetchJson`, `fetchJsonOptional`) already distinguish required-vs-optional; extend the pattern so the watch-detail page degrades to v1 behavior (no prices, no images) when `dealer-catalog.json` is missing.

---

## 9. Performance budget

- **First contentful paint**: <800 ms on a cold load over a 4G connection.
- **Total transferred (uncached)**: <250 KB for the home page, excluding dealer images.
- **JavaScript**: <40 KB minified. Vanilla, no framework. Current v1 is 1,250 lines unminified — that's fine.
- **CSS**: <30 KB. Inline critical above-the-fold rules in `<head>`.
- **Images**: lazy-load below the fold (`loading="lazy"`). Use `decoding="async"`. Reserve aspect-ratio space to prevent CLS.
- **JSON**: `dealer-catalog.json` could grow to 1–3 MB. Either (a) split per family `app/catalog/<family-id>.json` and lazy-fetch on family-detail navigation, or (b) gzip-serve and accept the cost. Recommendation: split.

---

## 10. Content authoring (small files, big impact)

Three thin JSON/Markdown files that are hand-maintained:

- `family-blurbs.json` — `{family_id: "2-3 sentence prose"}`. Used on family-detail pages. Empty by default; the `[ EDIT ]` link in the footer (visible only on `localhost`) opens an in-page editor that produces a downloadable updated JSON. ~80 entries to fill out.
- `factory-deep-blurbs.json` — extended factory descriptions beyond what the glossary provides. ~15 entries.
- `community-notes.json` — `{watch_id: ["note 1", "note 2"]}`. Caveats from reptime.help that warrant a callout. ~30 entries.

These never need to be exhaustive. Better to have a few good ones than empty file scaffolds for everything.

---

## 11. Accessibility (non-negotiable)

- WCAG 2.1 AA color contrast across all text.
- All images have `alt` text in the form `${brand} ${family} ${ref}`.
- Keyboard navigation: every CTA reachable via `Tab`, all expandable cards toggle via `Enter`/`Space`.
- Focus rings: 2 px solid `--accent`, never suppressed.
- `prefers-reduced-motion: reduce` disables all transitions.
- Screen-reader landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`. Each detail-page section is an `<article>` with an `aria-labelledby` heading.
- Skip-to-content link, hidden until focused.

---

## 12. Mobile responsive

Breakpoints: `360, 600, 900, 1200`.

- **<600 px**: single-column everywhere; sticky search bar at top; filter sidebar becomes a `[ FILTERS ]` button that opens a full-screen modal; dealer-offer cards stack the image to the left, price/CTA to the right.
- **600–900 px**: 2-column grids; sidebar collapses to a top filter bar.
- **>900 px**: full layout per §4.

All grids use CSS `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`, no media queries needed for the grid itself.

Touch targets: minimum 44 × 44 px.

---

## 13. Trust and legal

- **Footer disclaimer (permanent)**: *"Educational research tool. Replicas are unauthorized reproductions; this site does not sell or facilitate sales. Forum vetting reflects community consensus, not endorsement. Prices and availability are scraped from third-party dealers and may be inaccurate. Transact at your own risk."*
- **No tracking**: no analytics, no cookies (the existing `localStorage` for filter state is fine; document it in About).
- **No newsletter, no signup, no account**. Static, anonymous, honest.
- **DMCA contact** in About: an email or form. If a brand asks for a takedown, comply within 48 hours and mark the watch as "redacted" rather than deleting it (so the URL doesn't 404).
- **robots.txt** allows search-engine indexing of the site itself but does not encourage it. Add a `noindex` meta to dealer-detail pages by default.

---

## 14. What's explicitly out of scope (don't propose)

- Any kind of checkout, escrow, or affiliate-link revenue. The site never handles money.
- User accounts, comments, reviews, voting. Watch-the-community-not-be-the-community.
- Email notifications or price alerts (could be a v3.0 feature; not part of "ready to publish").
- A native app. Mobile web is the deliverable.
- A backend service. The site stays static; all dynamism comes from scheduled scrape jobs that produce JSON.
- Real-time prices. Weekly scrape is the SLA. Anything fresher needs a backend, which violates the static constraint.
- AI/LLM features. No "ask the bot which watch to buy." The recommendations are forum-derived, transparent, and human-curated.
- A second locale / translations. English only at launch.

---

## 15. Suggested phasing

The agent can ship in three coherent waves. Each wave is independently shippable; nothing later breaks anything earlier.

**Wave 1 — Catalog ingestion + watch-detail page** (largest lift; the headline feature)
- New: `dealer-catalog.json` (scraper, 1–2 dealers to start: Theonewatches + Trusty Time, both already proven scrape-able from terminal).
- New: `/#watch/<id>` route + watch-detail page per §4.4.
- Extend image fallback chain per §6.
- Extend dealer-link resolver per §7.
- Add price block, dealer-offer card, image carousel components.
- Watch cards on existing pages gain `FROM $X` line where data exists.

**Wave 2 — Surface polish + missing pages**
- New routes: `/#dealer/<id>`, `/#factory/<code>` (promoted from modal), `/#about`.
- Filter sidebar with price range + stock toggle + sort.
- Family detail "where it's stocked" rail and community notes.
- Empty/loading/error states audited and shipped for every page.
- Mobile responsive pass.
- Accessibility audit + fixes.

**Wave 3 — Catalog completeness + nice-to-haves**
- Scraper extended to all 17 dealers with search templates (those already verified in v1's `dealer-search.json`).
- Price-history sparkline on watch detail.
- Family blurbs and community notes content authored.
- USD conversion display.
- Performance pass (split catalog JSON, inline critical CSS, etc.).
- Compare page (`/#compare?ids=…`) if catalog coverage justifies it.

Stop after Wave 2 if scraping the long tail of dealers is a slog — Wave 3 is value-add, not table-stakes.

---

## 16. Definition of done

Per page:
- All four states (loading, loaded, empty, error) implemented and visually correct.
- Mobile, tablet, desktop layouts pass a manual eye-test on real devices.
- Keyboard-only navigation works end to end.
- Lighthouse: Performance ≥ 90, Accessibility ≥ 95, Best Practices = 100, SEO ≥ 90 (on home and watch-detail pages).
- No console errors or warnings on load or navigation.

Per system:
- Catalog scraper has been run end-to-end at least once and produced a non-empty `dealer-catalog.json`.
- The GitHub Action that produces it is wired and has succeeded on schedule.
- Every link on the live site resolves to either a 200 (within our control) or a working dealer page (out of our control, but we monitor with a weekly link-check action).
- At least 50% of the 485 watches have at least one dealer offer with image + price.

---

## 17. Hand-off note to the implementing agent

The current code (v1) is well-shaped: vanilla JS, no framework, ~1,250 lines, clean state machine, hash-based routing, and the recently-added dealer-link resolver is the model for the new catalog resolver. Don't rewrite — extend.

The aesthetic is in `styles.css` and is consistent. New components should reuse `--surface`, `--surface-deep`, `--line`, `--line-strong`, `--fg`, `--fg-mute`, `--fg-dim`, `--accent` and the existing `[ ]` and `//` decorations. Don't introduce new colors or new font families.

The biggest unknown is the catalog scraper. Start with the two dealers proven to be scrape-able from terminal (Theonewatches OpenCart, Trusty Time Zen Cart) before tackling the Cloudflare-protected ones. The output JSON shape is fixed (§7); the scraper internals can iterate.

Treat this spec as a contract on the **what**, not the **how**. Where this spec under-specifies something, ask the user before improvising.
