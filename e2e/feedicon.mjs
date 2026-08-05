import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://localhost:4321/feed', { waitUntil:'networkidle' });
await p.evaluate(() => { const f=document.getElementById('feed'); f.scrollTo(0, window.innerHeight); });
await p.waitForTimeout(1500);
console.log(await p.evaluate(() => {
  const btn = document.querySelector('.card.visible .mute-btn');
  if(!btn) return 'no visible mute-btn';
  const out = {};
  for (const cls of ['icon-muted','icon-unmuted']) {
    const el = btn.querySelector('.'+cls);
    const r = el?.getBoundingClientRect();
    out[cls] = el ? {w:Math.round(r.width), h:Math.round(r.height), display:getComputedStyle(el).display} : 'missing';
  }
  const pb = document.querySelector('.podcast-badge svg');
  out.podcastIcon = pb ? {w:Math.round(pb.getBoundingClientRect().width)} : 'none on this card';
  return JSON.stringify(out);
}));
await b.close();
