import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import react from "@astrojs/react";
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// Fully static site (output defaults to "static") — every page is prerendered
// at build time and served as static assets on Cloudflare Pages, so no SSR
// adapter is needed (and there's no per-request Worker invocation).
export default defineConfig({
  site: "https://dpolzer.pages.dev",
  integrations: [mdx(), sitemap(), react()],
  //https://docs.astro.build/en/guides/prefetch/
  prefetch: true,
  vite: {
    plugins: [tailwindcss()],
  },
});
