import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import prefetch from "@astrojs/prefetch";

export default defineConfig({
  site: "https://dongyue.org",
  trailingSlash: "always",
  compressHTML: true,
  build: {
    inlineStylesheets: "never",
  },
  integrations: [
    sitemap(),
    prefetch({ selector: "a[href^='/']" }),
  ],
});
