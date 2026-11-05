# @openpanel/logos

Brand logos the dashboard shows next to browser, OS, device and a few
referrer names: committed PNGs plus the map from a name to its file.

They used to be hotlinked from Wikipedia, blogs and app stores and
rasterized by the api on request. Now they are files in this package, so the
dashboard needs no image proxy for them and they do not change under it.

- `src/sources.ts` says where each logo comes from and which names map to it.
  A logo that is a black glyph sets `dark: 'invert'` (or a separate source
  URL) and gets a `-dark.png` the dashboard shows on the dark theme.
- `bun run generate` downloads the sources, renders each to a 64x64
  transparent PNG in `assets/` and rewrites `src/index.ts`. Run it on a dev
  machine when a source changes and commit the result; it is not a build step,
  so CI never downloads anything.
