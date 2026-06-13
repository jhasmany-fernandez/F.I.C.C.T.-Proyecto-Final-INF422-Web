import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#0d2c54",
        sky: "#2b77f3",
        slateBlue: "#eef4ff",
      },
      boxShadow: {
        panel: "0 20px 60px rgba(13, 44, 84, 0.18)",
      },
      fontFamily: {
        sans: ["Segoe UI", "Tahoma", "Geneva", "Verdana", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
