import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

import sitemap from '@astrojs/sitemap';

import tailwind from '@astrojs/tailwind';
import react from "@astrojs/react";

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site:"https://dpolzer.pages.dev",
  integrations: [mdx(), sitemap(), react(), tailwind()],
  //https://docs.astro.build/en/guides/prefetch/
  prefetch:true,
  output:"server",
  adapter: cloudflare()
});