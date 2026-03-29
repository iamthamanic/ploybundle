import type { Config } from "tailwindcss";
import daisyui from "daisyui";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {} },
  plugins: [daisyui],
  daisyui: { themes: ["dark"], darkTheme: "dark" },
};

export default config;
