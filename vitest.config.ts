import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globals: true,
    env: {
      DATABASE_URL: "file:./dev.db",
      AUTH_SECRET: "test-secret-en-az-32-karakter-uzunlugunda-olmali-1234",
      NODE_ENV: "test",
    },
    testTimeout: 20000,
  },
});
