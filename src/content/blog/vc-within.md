---
title: 'VC Within: the most VC-funded startups of 2025–2026 on a 3D globe'
description: 'An interactive globe of the startups that raised the most venture money in 2025 and 2026: every round, valuation, lead investor and source, by sector and city.'
pubDate: 'Nov 16 2026'
heroImage: '/vc-within-hero.png'
liveUrl: 'https://vcwithin.com/'
---

[**Open VC Within →**](https://vcwithin.com/)

VC Within puts the most heavily funded startups of 2025 and 2026 on a 3D globe. Click a company to see its full funding history and arcs to its investors. Filter by sector, region, stage or round size, look at one year or both, and scrub the timeline month by month. Nearby companies merge into count bubbles that split as you zoom in.

## At launch (mid-November 2026)

| | |
|---|---|
| Companies | 376 |
| Rounds in 2025–2026 | 718 (639 equity, 52 debt, 27 secondary) |
| Equity raised in 2025–2026 | $669B ($175B in 2025, $494B in 2026 so far) |
| Investors in the registry | 524 |

A few things stand out:

- **AI labs took 56% of all equity**: $376B across 29 companies.
- **North America raised 84%** of the total, Europe about 7.5%, China about 5%.
- **2026 is already almost 3×** 2025, with six weeks still to go.

## What else is on the site

- [**/insights**](https://vcwithin.com/insights): nine charts on sectors, regions, months, round sizes and investors.
- **Company and sector pages** with every round and its sources.
- [**/reports**](https://vcwithin.com/reports): a short daily report, generated from the data.
- [**/methodology**](https://vcwithin.com/methodology): what counts, where the numbers come from, and how confident each one is.

Every round links to at least one source and carries a confidence level (confirmed or reported). Totals count primary equity only; debt and secondary sales are tracked separately.

## How it's built

A static [Astro](https://astro.build) site with vanilla TypeScript, no UI framework. The globe is a single ray-cast sphere drawn with three.js and WebGL2; it renders only when something changes. Markers are a DOM overlay clustered with supercluster. Amounts span $10M to over $100B, so every visual encoding of money is log-scaled. The data is one JSON file per company, checked by a strict validator before every build. It is hosted on Cloudflare Workers static assets and redeployed daily.
