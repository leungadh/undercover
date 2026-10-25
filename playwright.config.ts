import { defineConfig } from "@playwright/test";

// The end-to-end run has its own backend, database and dashboard, so it never
// changes the queue in a running `npm run dev` on ports 8000 and 5173.
export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/test-results",
  reporter: "list",
  use: { baseURL: "http://localhost:5174" },
  webServer: [
    {
      command:
        "uv run -m backend.seed && uv run -m uvicorn backend.main:app --port 8001",
      url: "http://127.0.0.1:8001/api/health",
      env: { UNDERCOVER_DB: "e2e/undercover-e2e.db" },
      reuseExistingServer: false,
    },
    {
      command: "npx vite dashboard --port 5174 --strictPort",
      url: "http://localhost:5174",
      env: { BACKEND_PORT: "8001" },
      reuseExistingServer: false,
    },
  ],
});
