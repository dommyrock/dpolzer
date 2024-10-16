/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  important:true,
  theme: {
    extend: {
      colors:{'dommy-black':"#0f0f10"}
    },
  },
  plugins: [],
};
