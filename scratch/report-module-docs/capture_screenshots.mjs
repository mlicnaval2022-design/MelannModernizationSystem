import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const outDir = path.join(root, "outputs", "report-module-docs", "assets");
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });

async function safeScreenshot(name) {
  await page.screenshot({ path: path.join(outDir, name), fullPage: true });
}

try {
  await page.goto("http://127.0.0.1:5173/login", { waitUntil: "networkidle" });
  await page.locator('input[name="username"], input[type="text"]').first().fill("admin");
  await page.locator('input[name="password"], input[type="password"]').first().fill("admin123");
  await page.locator('button[type="submit"], button').filter({ hasText: /login|sign in/i }).first().click();
  await page.waitForURL(/(dashboard|reports|\/$)/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  await page.goto("http://127.0.0.1:5173/reports", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await safeScreenshot("reports-module-screen.png");

  await page.goto("http://127.0.0.1:5173/dcr", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await safeScreenshot("daily-cash-report-screen.png");

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("http://127.0.0.1:5173/reports", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await safeScreenshot("reports-mobile-screen.png");
} finally {
  await browser.close();
}
