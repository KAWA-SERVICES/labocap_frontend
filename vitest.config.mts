import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Configuration minimale : environnement DOM (DOMPurify et Testing Library en
// ont besoin) et alias `@/` identique à tsconfig.json.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
