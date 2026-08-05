/**
 * Design-system regression audit.
 *
 *   node e2e/audit.mjs [baseUrl]
 *
 * Checks the two things that silently rot when tokens change:
 *   1. WCAG AA contrast for every text/background pair the system produces,
 *      in BOTH themes. Secondary text sits on --color-paper AND
 *      --color-surface; it is easy to pass one and fail the other.
 *   2. The nav stays on one line and under the 80px height cap at every
 *      desktop width.
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] || 'http://localhost:4321';

const luminance = (rgb) => {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

let failures = 0;
const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  console.log(`\n=== ${theme.toUpperCase()} ===`);

  const pairs = await page.evaluate(() => {
    const css = (sel, prop) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el)[prop] : null;
    };
    const bg = getComputedStyle(document.body).backgroundColor;
    return {
      'heading on paper': [css('h1', 'color'), bg],
      'secondary on paper': [css('main p', 'color'), bg],
      'accent on paper': [css('dt', 'color'), bg],
      'secondary on surface': [css('.bg-surface p', 'color'), css('.bg-surface', 'backgroundColor')],
      'nav link': [css('header nav a:nth-child(3)', 'color'), bg],
      'primary button': [css('.btn-primary', 'color'), css('.btn-primary', 'backgroundColor')],
      'secondary button': [css('.btn-secondary', 'color'), bg],
    };
  });

  for (const [name, [fg, bg]] of Object.entries(pairs)) {
    if (!fg || !bg) { console.log(`  ${name.padEnd(22)} SKIP (not on page)`); continue; }
    const ratio = contrast(fg, bg);
    const ok = ratio >= 4.5;
    if (!ok) failures++;
    console.log(`  ${name.padEnd(22)} ${ratio.toFixed(2)}:1  ${ok ? 'pass' : 'FAIL (AA needs 4.5)'}`);
  }

  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const nav = await page.evaluate(() => {
      const links = [...document.querySelectorAll('header nav .hidden.md\\:flex a')];
      const rows = new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size;
      return { rows, height: document.querySelector('header').getBoundingClientRect().height };
    });
    const ok = nav.rows === 1 && nav.height <= 80;
    if (!ok) failures++;
    console.log(`  nav @${String(width).padEnd(5)} ${nav.height}px, ${nav.rows} row  ${ok ? 'pass' : 'FAIL'}`);
  }
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
