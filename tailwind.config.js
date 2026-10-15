/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  important:true,
  theme: {
    extend: {
      // Same as --bg in src/styles/global.css.
      colors:{'dommy-black':"#0b0d10"},
      // Loaded from Google Fonts in src/components/BaseHead.astro.
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        display: ['"Chakra Petch"', '"JetBrains Mono"', 'ui-sans-serif', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
