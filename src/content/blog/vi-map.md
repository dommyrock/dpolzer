---
title: 'VI-map: an interactive fan map of Leonida'
description: 'A zoomable fan map of Leonida, the state where GTA VI takes place: 419 locations across 6 regions and 16 categories, with search, filters and shareable links.'
pubDate: 'Nov 22 2026'
heroImage: '/vi-map-hero.webp'
liveUrl: 'https://dommyrock.github.io/VI-map/'
---

[**Open VI-map →**](https://dommyrock.github.io/VI-map/) · [Source on GitHub](https://github.com/dommyrock/VI-map)

A fan project for exploring Leonida before GTA VI is out. All 419 pre-release points of interest sit on one zoomable map, each tagged with a region and a category, so questions like "how many gas stations are in Vice City?" are a click away.

- **Search** by name, category, region or description, and fly straight to the result.
- **Filter** 16 categories in 5 groups, with live counts of what's in view.
- **Compare regions**: focus one or several of the 6 regions. Each has a drawer with a postcard, its real-world inspiration, a per-category breakdown and must-see spots.
- **Share** exactly what you're looking at: the URL keeps the selected regions and the open location.

## How it's built

A static [Astro](https://astro.build) page with one [Preact](https://preactjs.com) island and [nanostores](https://github.com/nanostores/nanostores) for state. [MapLibre GL JS](https://maplibre.org) draws the map on the GPU from a WebP tile pyramid cut with sharp. Region polygons are traced from the map image with Python and OpenCV, and every data file is validated with Zod at build time. It is deployed to GitHub Pages on every push.
