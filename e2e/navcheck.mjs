import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1024,height:900} });
await p.goto('http://localhost:4321/', { waitUntil:'networkidle' });
for (const w of [1024, 1280, 1440, 1920]) {
  await p.setViewportSize({ width:w, height:900 });
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => {
    const links = [...document.querySelectorAll('header nav .hidden.md\\:flex a')];
    const tops = new Set(links.map(a => Math.round(a.getBoundingClientRect().top)));
    const h = document.querySelector('header').getBoundingClientRect().height;
    const logo = document.querySelector('header nav > div > a').getBoundingClientRect();
    return { rows: tops.size, n: links.length, h, logoTop: Math.round(logo.top), linkTop: [...tops][0] };
  });
  console.log(`${w}px  header=${r.h}px  navLinks=${r.n}  rows=${r.rows}  ${r.rows===1?'ONE LINE':'WRAPPED'}`);
}
await b.close();
