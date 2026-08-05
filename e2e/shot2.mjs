import { chromium } from '@playwright/test';
const [,, url, out, y] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await p.goto(url, { waitUntil: 'networkidle' });
await p.evaluate(async (target) => {
  const step = 400;
  for (let i = 0; i < target; i += step) { window.scrollTo(0, i); await new Promise(r=>setTimeout(r,60)); }
  window.scrollTo(0, target);
}, Number(y));
await p.waitForTimeout(1500);
await p.screenshot({ path: out });
await b.close();
