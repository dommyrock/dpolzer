import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

import sitemap from '@astrojs/sitemap';

import tailwind from '@astrojs/tailwind';
import react from "@astrojs/react";

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://example.com',

  // site: process.env.VERCEL
  // ? "https://www.maxphillips.dev"
  // : "http://localhost:3000",
  integrations: [mdx(), sitemap(), react(), tailwind()],

  output:"static",

  //https://docs.astro.build/en/guides/prefetch/
  prefetch:true,
  output:"server",
  adapter: cloudflare()
});