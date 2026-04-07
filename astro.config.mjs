import tailwind from "@astrojs/tailwind"
import { defineConfig } from "astro/config"

const deployTarget = process.env.DEPLOY_TARGET

export default defineConfig({
  ...(deployTarget === "github-pages"
    ? {
        site: "https://jxnl.github.io",
        base: "/book-of-disquiet",
      }
    : {}),
  integrations: [tailwind()],
})
