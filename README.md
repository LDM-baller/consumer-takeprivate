# Consumer Take-Private Precedents

A mobile-first static web app showing precedent consumer take-private transactions above $1B equity value (2023–2026). Tap a deal for full detail (price chart, premiums, deal context); scroll for the premium distribution across the sample.

## Local dev

```bash
python -m http.server 8765
```

Then open <http://localhost:8765>.

The app loads JSON from `data/` via `fetch`, so you must serve it (opening `index.html` directly will fail with CORS errors).

## Refreshing the data

The underlying data lives in an Excel workbook (kept locally, not committed). To re-export after editing it:

```bash
python export.py /path/to/Consumer\ take\ privates.xlsx
```

This regenerates:

- `data/deals.json` — the Summary tab
- `data/prices/{TICKER}.json` — daily close history per ticker

## Deploying to GitHub Pages

After pushing to GitHub: Settings → Pages → Source = `main` branch, root. Done.

## Stack

- Plain HTML / CSS / vanilla JS — no build step, no framework
- SVG chart hand-rolled (no chart library)
- Static JSON data
