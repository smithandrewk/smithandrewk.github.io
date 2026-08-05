import { chromium } from '@playwright/test';
const [,, url, out, mode, full] = process.argv;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
if (mode === 'dark') await ctx.addInitScript(() => localStorage.setItem('theme','dark'));
else await ctx.addInitScript(() => localStorage.setItem('theme','light'));
const p = await ctx.newPage();
await p.goto(url, { waitUntil: 'networkidle' });
// Scroll through so IntersectionObserver reveals fire, then return to top.
await p.evaluate(async () => {
  const step = window.innerHeight * 0.7;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise(r => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await p.waitForTimeout(1000);
await p.screenshot({ path: out, fullPage: full === 'full' });
await b.close();
