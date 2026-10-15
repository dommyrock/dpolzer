# dpolzer

My personal site and blog: work experience, featured projects and posts. A fully static [Astro](https://docs.astro.build) site with Tailwind CSS, hosted on Cloudflare Pages at https://dpolzer.pages.dev.

## Project structure

```text
├── public/                  # static files served as-is: images, fonts, favicon
│   └── _headers             # Cloudflare Pages headers (1-year cache for /fonts/*)
├── src/
│   ├── components/
│   │   ├── Home.astro       # home page: helix background, hero, projects, posts
│   │   ├── Helix.astro      # the dot helix behind the home page, and the hero link's underline
│   │   ├── FeaturedProject.astro  # the featured projects list
│   │   ├── RecentPosts.astro      # the posts listed on the home page
│   │   ├── SectionHeading.astro   # numbered section titles ("01  Featured projects")
│   │   └── ...              # header, footer, hero, head tags
│   ├── content/blog/        # one Markdown file per post
│   ├── content.config.ts    # frontmatter schema of the posts
│   ├── layouts/BlogPost.astro     # page layout of a post and of /about
│   ├── pages/
│   │   ├── index.astro      # /
│   │   ├── about.astro      # /about
│   │   ├── blog/index.astro # /blog, every post
│   │   ├── blog/[...slug].astro   # /blog/<slug>
│   │   └── rss.xml.js       # /rss.xml
│   ├── styles/global.css    # palette, fonts, panels, tags and post log rows shared by every page
│   └── consts.ts            # site title and description
├── astro.config.mjs         # site URL, MDX, sitemap, React, Tailwind
└── .nvmrc                   # Node 22.12.0
```

## Commands

Run from the repository root with Node 22 (`nvm use` reads `.nvmrc`):

| Command | What it does |
|---|---|
| `npm ci` | Installs the dependencies from `package-lock.json` |
| `npm run dev` | Starts the dev server at http://localhost:4321, reloading on every change |
| `npm run build` | Builds the static site into `dist/` |
| `npm run preview` | Serves `dist/` at http://localhost:4321, as it will be deployed |

## Testing locally

1. `npm run dev` and open http://localhost:4321 while you edit; pages reload on save.
2. Before pushing, `npm run build`. It fails on a post whose frontmatter does not match `src/content.config.ts`, and lists every page it built.
3. `npm run preview` and check the built pages: `/`, `/blog`, the new `/blog/<slug>/` and `/rss.xml`.

## Adding a post

1. Add `src/content/blog/<slug>.md`. The file name is the URL slug.

   ```markdown
   ---
   title: 'Post title'
   description: 'One or two sentences for the post list and RSS.'
   pubDate: 'Oct 15 2026'
   heroImage: '/image-in-public.webp'   # optional
   ---

   Body text. The layout prints the title, so start without a `# heading`.
   ```

2. Add an entry at the top of the `posts` list in `src/components/RecentPosts.astro`, so it shows on the home page. `/blog`, the sitemap and the RSS feed pick the post up on their own.
3. Images go in `public/` and are referenced from `/`.

Featured projects are a separate list, in `src/components/FeaturedProject.astro`.

## Deployment

Cloudflare Pages builds the site with `npm run build` and serves `dist/`. Every page is prerendered, so there is no SSR adapter and no Worker runs per request. `public/_headers` sets the cache headers.

The site started from Astro's blog template.
