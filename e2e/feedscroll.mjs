import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://localhost:4321/feed', { waitUntil:'networkidle' });
// scroll to a video card so the mute button renders
await p.evaluate(() => { const f=document.getElementById('feed'); f.scrollTo(0, window.innerHeight*1); });
await p.waitForTimeout(1500);
await p.screenshot({ path: process.argv[2] });
const info = await p.evaluate(() => {
  const btn = document.querySelector('.card.visible .mute-btn');
  if(!btn) return 'no visible mute-btn';
  const svg = btn.querySelector('svg');
  const r = svg?.getBoundingClientRect();
  return { hasSvg: !!svg, w: r?.width, h: r?.height };
});
console.log('mute button icon:', JSON.stringify(info));
await b.close();
