#!/usr/bin/env node
// Drives the running uigen dev server with headless Chromium.
// Usage: node driver.mjs <command> [args]
//   smoke                    full golden-path smoke test (chat -> generate -> interact), screenshots to ./shots/
//   screenshot <name>        load the app and save one screenshot
//   prompt "<text>" <name>   send a chat message and screenshot the result

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = path.join(__dirname, "shots");
mkdirSync(SHOTS_DIR, { recursive: true });

const BASE_URL = process.env.UIGEN_URL || "http://localhost:3000";

async function withPage(fn) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  try {
    await fn(page);
  } finally {
    if (consoleErrors.length) {
      console.error("Console errors observed:\n" + consoleErrors.join("\n"));
    }
    await browser.close();
  }
}

async function screenshot(page, name) {
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`screenshot -> ${file}`);
}

async function sendPrompt(page, text) {
  const textarea = page.getByPlaceholder("Describe the React component you want to create...");
  await textarea.click();
  await textarea.fill(text);
  await textarea.press("Enter");
  // Mock model (no ANTHROPIC_API_KEY) finishes in a couple seconds; real
  // Claude calls take longer. Wait for the tool-call trace to stop growing.
  await page.waitForTimeout(6000);
}

const [, , cmd, ...args] = process.argv;

if (cmd === "screenshot") {
  const name = args[0] || "screenshot";
  await withPage(async (page) => {
    await page.goto(BASE_URL);
    await page.waitForSelector("text=React Component Generator");
    await screenshot(page, name);
  });
} else if (cmd === "prompt") {
  const [text, name] = args;
  if (!text) throw new Error('usage: node driver.mjs prompt "<text>" [name]');
  await withPage(async (page) => {
    await page.goto(BASE_URL);
    await page.waitForSelector("text=React Component Generator");
    await sendPrompt(page, text);
    await screenshot(page, name || "prompt-result");
  });
} else if (cmd === "smoke" || !cmd) {
  await withPage(async (page) => {
    await page.goto(BASE_URL);
    await page.waitForSelector("text=React Component Generator");
    await screenshot(page, "01-initial");

    await sendPrompt(page, "Create a simple blue button component");
    await screenshot(page, "02-after-generate");

    // Prove the preview iframe is a live, interactive React app, not a
    // static render, by clicking a generated control and re-screenshotting.
    const frame = page.frameLocator("iframe").first();
    const increase = frame.getByText("Increase", { exact: false });
    if (await increase.count()) {
      await increase.click();
      await screenshot(page, "03-after-interaction");
    }
  });
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}
