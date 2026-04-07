import tailwind from "@astrojs/tailwind"
import { defineConfig } from "astro/config"

export default defineConfig({
  site: "https://jxnl.github.io",
  base: "/book-of-disquiet",
  integrations: [tailwind()],
})
