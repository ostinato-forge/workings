/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { CONTENT_SECURITY_POLICY } from "./scripts/content-security-policy";

export default defineConfig({
  plugins: [react(), {
    // The development server needs inline scripts for live reload, so the policy is added to builds only.
    name: "workings-content-security-policy",
    apply: "build",
    transformIndexHtml: () => [{
      tag: "meta",
      attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
      injectTo: "head-prepend",
    }],
  }, {
    name: "workings-local-draft",
    configureServer(server) {
      server.middlewares.use("/__workings_draft", async (request, response) => {
        if (request.method !== "GET") { response.statusCode = 405; response.end(); return; }
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        try { response.end(await readFile(new URL("./.workings/preview.json", import.meta.url), "utf8")); }
        catch { response.statusCode = 404; response.end(JSON.stringify({ error: "Choose a validated draft with the training preview command." })); }
      });
    },
  }],
  // Small fonts and images ship as files. Embedding them as data would need a looser policy.
  build: { assetsInlineLimit: 0 },
  test: {
    globals: true,
    environment: "node",
  },
});
