---
title: 'Galaxy 3D simulation: eight galaxies at their real scale'
description: 'An interactive WebGL2 simulation of the Milky Way and seven famous galaxies, from Andromeda to the Cartwheel. The shapes, sizes, distances and landmarks come from published research; most of the 5,000–10,000 objects per galaxy are generated.'
pubDate: 'Nov 12 2026'
heroImage: '/galaxy-3d-hero.png'
liveUrl: '/galaxy-3d/'
---

[**Open the live simulation →**](/galaxy-3d/)

A 3D atlas of eight galaxies you can orbit, zoom into and search. Pick a galaxy from the tabs along the top. Each one is generated in your browser the first time you open it, then kept in memory, so switching back is instant.

| Galaxy | Shape | Width | Distance |
|---|---|---|---|
| Milky Way | barred spiral | ≈ 87,000–100,000 ly | you are here |
| Andromeda (M31) | barred spiral with a star-forming ring | ≈ 152,000 ly | 2.5 million ly |
| Triangulum (M33) | flocculent spiral | ≈ 61,000 ly | 2.9 million ly |
| Large Magellanic Cloud | Magellanic spiral, off-center bar | ≈ 32,000 ly | 162,000 ly |
| Whirlpool (M51) | grand-design spiral with companion | ≈ 77,000–91,000 ly | ≈ 28 million ly |
| Sombrero (M104) | spiral seen nearly edge-on | ≈ 95,000 ly | 31 million ly |
| Messier 87 | giant elliptical with a jet | ≈ 132,000 ly | 53.5 million ly |
| Cartwheel | ring galaxy | ≈ 150,000 ly (outer ring) | ≈ 500 million ly |

All eight use the same units, light-years. A dashed **"Milky Way to scale"** ring is drawn behind the other galaxies, so you can see straight away that Andromeda is about 1.7× wider than our galaxy and the LMC a little over a third as wide. Measured from the generated stars, every galaxy's width comes out within about 5–15% of its published diameter, and its width relative to the Milky Way within about 10%.

## What is real and what is generated

Most of what you see is generated, and the page says so. The parts that come from research:

- **Shapes and sizes.** Diameters (mostly the D25 isophote), arm counts and pitch angles, bars, rings, bulge-to-disk balance, and the inclination and position angle each galaxy shows from Earth.
- **Distances and sky positions.** Each external galaxy sits at its measured distance and J2000 position. Every object's RA/Dec is projected from its place in the galaxy, so it points at the right patch of sky.
- **Landmarks**, 84 in total. These are the 49 Milky Way landmarks from the first version (the Sun, Betelgeuse, Sgr A\*, the Crab Nebula…), and for the other galaxies:
  - Andromeda: M31\*, M32, M110, NGC 206, Mayall II, Hubble's Cepheid V1 and the yearly recurrent nova M31N 2008-12a.
  - Triangulum: NGC 604, NGC 595, M33 X-7 and IC 133.
  - LMC: the Tarantula Nebula, R136, R136a1, SN 1987A, N11, N44, LMC X-1 and LMC X-3.
  - Whirlpool: NGC 5195, three supernovae, and M51-ULS-1 with the first planet candidate found in another galaxy.
  - Messier 87: M87\* and the jet knots HST-1 and A.
  - Cartwheel: its companions G1 and G2.

  Their sizes, masses and separations from the galaxy center come from the papers listed below. Where sources disagree, the card says so or gives a range.

What is **generated**:

- Every other star, cluster, nebula, pulsar and black hole. There are 6,000–10,000 per galaxy, placed by a seeded random generator along the real structure. Their names are position-based designations (like `LGGS J004041.7+405442`) that don't refer to real catalog entries.
- The roughly 30,000–56,000 unresolved field stars and the glow and dust haze.
- The motion. Each galaxy rotates as a pattern with small epicycles, which is not real dynamics. Orbits and object sizes are enlarged so you can see them.

For scale: the real catalogs behind this are far larger. Gaia DR3 alone has 1,811,709,771 sources, and Andromeda holds roughly a trillion stars. The simulation is a picture of each galaxy's structure, not a catalog.

## How it's built

- **One WebGL2 draw call per layer.** Each object is 16 floats of orbit parameters. The vertex shader computes every position from those and a few time uniforms, so the CPU never streams geometry. Picking is one CPU pass, and only while the pointer is over the scene.
- **On-demand galaxies.** The engine and the Milky Way ship in one ~46 KB (gzipped) module. Each other galaxy is a 2–3 KB chunk that loads the first time its tab is opened. It builds its world in ~35–60 ms, which is hidden behind a short fade, and is uploaded into the same GPU buffers.
- **Same budget everywhere.** No galaxy has more than ~10,000 interactive objects and ~65,000 points in total, the same budget as the original Milky Way-only atlas. The adaptive pixel-ratio fallback still kicks in on slow GPUs.
- **Deterministic.** Each galaxy has its own seed, so it looks the same on every load, in any tab order.

The page is a plain Astro route with no framework runtime. The code is split into a shape kit (`spiral`, `elliptical`, sky projection) and one small module per galaxy.

## Sources

**Milky Way**
- GRAVITY Collaboration 2019, distance to the Galactic center (R0 = 8.178 kpc) and the mass of Sgr A\*: [arXiv:1904.05721](https://arxiv.org/abs/1904.05721)
- Reid et al. 2019, spiral arm pitch angles: [arXiv:1910.03357](https://arxiv.org/abs/1910.03357)
- Wegg, Gerhard & Portail 2015, the bar: [arXiv:1504.01401](https://arxiv.org/abs/1504.01401)
- Event Horizon Telescope, Sgr A\* Paper I: [arXiv:2311.08680](https://arxiv.org/abs/2311.08680)
- ESA, Gaia DR3 source count: [cosmos.esa.int/web/gaia/dr3](https://www.cosmos.esa.int/web/gaia/dr3)

**Andromeda (M31)**
- Riess et al. 2012, distance: [arXiv:1110.3769](https://arxiv.org/abs/1110.3769)
- Corbelli et al. 2010, orientation: [arXiv:0912.4133](https://arxiv.org/abs/0912.4133)
- Bender et al. 2005, M31\*: [arXiv:astro-ph/0509839](https://arxiv.org/abs/astro-ph/0509839)
- NASA, Hubble's variable star V1: [science.nasa.gov](https://science.nasa.gov/missions/hubble/hubble-views-the-star-that-changed-the-universe/)
- Darnley et al. 2016, recurrent nova M31N 2008-12a: [arXiv:1607.08082](https://arxiv.org/abs/1607.08082)

**Triangulum (M33)**
- Kam et al. 2017, orientation: [arXiv:1706.04248](https://arxiv.org/abs/1706.04248)
- Orosz et al. 2007, M33 X-7: [arXiv:0710.3165](https://arxiv.org/abs/0710.3165)
- Brunthaler et al. 2005, IC 133 water masers: [arXiv:astro-ph/0503058](https://arxiv.org/abs/astro-ph/0503058)

**Large Magellanic Cloud**
- Pietrzyński et al. 2019, distance to 1%: [arXiv:1903.08096](https://arxiv.org/abs/1903.08096)
- van der Marel & Kallivayalil 2014, orientation: [arXiv:1305.4641](https://arxiv.org/abs/1305.4641)
- Kalari et al. 2022, the mass of R136a1: [arXiv:2207.13078](https://arxiv.org/abs/2207.13078)
- Orosz et al. 2009, LMC X-1: [arXiv:0810.3447](https://arxiv.org/abs/0810.3447)
- Orosz et al. 2014, LMC X-3: [arXiv:1402.0085](https://arxiv.org/abs/1402.0085)

**Whirlpool (M51)**
- McQuinn et al. 2016, distance (8.58 Mpc; other estimates range from 7.2 to 9.5): [arXiv:1606.04120](https://arxiv.org/abs/1606.04120)
- Colombo et al. 2014, orientation: [arXiv:1401.3759](https://arxiv.org/abs/1401.3759)
- Di Stefano et al. 2021, planet candidate M51-ULS-1b: [arXiv:2009.08987](https://arxiv.org/abs/2009.08987)

**Sombrero (M104)**
- Vlahakis et al. 2008, the dust ring: [arXiv:0805.4791](https://arxiv.org/abs/0805.4791)
- Jardel et al. 2011, black hole mass (about 6.6 × 10⁸ M☉; Kormendy et al. 1996 found about 10⁹): [arXiv:1107.1238](https://arxiv.org/abs/1107.1238)

**Messier 87**
- Event Horizon Telescope 2019, Paper VI, the mass of M87\*: [arXiv:1906.11243](https://arxiv.org/abs/1906.11243)

**Cartwheel**
- NASA, "The Cartwheel Galaxy: a starry ring world born in a head-on collision": [science.nasa.gov](https://science.nasa.gov/asset/hubble/the-cartwheel-galaxy-a-starry-ring-world-born-in-a-head-on-collision/)
- ESA/Webb 2022 release: [esawebb.org/news/weic2211](https://esawebb.org/news/weic2211/)
- Higdon et al. 2015, the rings: [arXiv:1511.07227](https://arxiv.org/abs/1511.07227)

Coordinates are from [SIMBAD](https://simbad.cfa.harvard.edu/simbad/). Diameters and star counts are from the Wikipedia infoboxes of each galaxy, which in turn cite NED and the papers above.

[**Open the live simulation →**](/galaxy-3d/)
