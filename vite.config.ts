/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";

export default defineConfig({
  plugins: [react(), {
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
  test: {
    globals: true,
    environment: "node",
  },
});
