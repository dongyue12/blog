import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://dongyue.org",
  trailingSlash: "always",
  compressHTML: true,
  build: {
    inlineStylesheets: "auto",
  },
  integrations: [
    sitemap(),
  ],
});
