---
name: note:punch-map-carto-tiles-need-api-key
description: "PunchMapDialog's CARTO basemap tiles render with an 'API KEY REQUIRED / carto.com/basemaps' watermark stamped across every tile — the map works but reads as broken"
date: 04-09-26
feature: ui-ux-overhaul
---

# Punch map tiles are watermarked "API KEY REQUIRED"

**Status**: BACKLOG — cosmetic but user-visible on every punch map. Not a phase 03 regression.
**Raised by**: the phase 03 live dialog pass on 04-09-26, screenshotting `/punch` → "View on
map" as `dino@jojo.ph`.

## What happens

`src/lib/components/timesheets/PunchMapDialog.svelte:86` loads
`https://{s}.basemaps.cartocdn.com/light_all/…` (and `dark_all` under `.dark`). The tiles load
— HTTP 200, the map is pannable, the pin and accuracy circle draw correctly — but CARTO now
stamps **"API KEY REQUIRED — carto.com/basemaps"** diagonally across each tile.

The map is still readable. It just looks like a licence violation to anyone who opens it.

Verified live: 5 tiles loaded in light, 4 in dark, watermark present in both.

## Not a phase 03 regression

Phase 03 (S6-S12) only moved the Leaflet dynamic import inside the `Dialog` primitive. The tile
URL predates it. CARTO changed their terms; the code did not.

## Options

1. **Switch to plain OpenStreetMap tiles** — `https://tile.openstreetmap.org/{z}/{x}/{y}.png`.
   No key, no watermark, and the attribution string in the component is already correct for it.
   The cost: OSM has no dark variant, so the theme-aware light/dark swap at `:86` would be lost
   or need a CSS filter. This is the one-line fix.
2. **Get a CARTO API key** — keeps both themes, adds a key to manage and an env var to the
   deploy. Free tier exists.

Option 1 unless the dark basemap is considered worth an account. The theme swap is a nicety;
the watermark is on every map.

## Verify after

Open `/punch` → "View on map" in **both** themes and screenshot. The check is visual — the
tiles return 200 either way, so a status-code assertion proves nothing here.
