/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  important:true,
  theme: {
    extend: {
      // Same as --bg in src/styles/global.css.
      colors:{'dommy-black':"#131519"}
    },
  },
  plugins: [],
};
