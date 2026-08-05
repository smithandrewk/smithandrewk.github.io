import { chromium } from '@playwright/test';

function lum(hex){
  const c = hex.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{
    v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4);
  });
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
}
function ratio(a,b){ const l1=lum(a),l2=lum(b); return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)); }

const b = await chromium.launch();
for (const mode of ['light','dark']) {
  const ctx = await b.newContext({ viewport:{width:1440,height:900} });
  await ctx.addInitScript(m => localStorage.setItem('theme', m), mode);
  const p = await ctx.newPage();
  console.log(`\n===== ${mode.toUpperCase()} =====`);
  await p.goto('http://localhost:4321/', { waitUntil:'networkidle' });

  const nav = await p.evaluate(() => {
    const h = document.querySelector('header');
    const inner = h.querySelector('nav > div');
    const links = [...h.querySelectorAll('nav a')];
    const tops = new Set(links.map(a => Math.round(a.getBoundingClientRect().top)));
    return { height: h.getBoundingClientRect().height,
             innerHeight: inner.getBoundingClientRect().height,
             navRows: tops.size, linkCount: links.length };
  });
  console.log(`nav height: ${nav.height}px (cap 80) | rows of links: ${nav.navRows} (must be 1) | links: ${nav.linkCount}`);

  const pairs = await p.evaluate(() => {
    const get = (sel, prop) => { const e=document.querySelector(sel); return e?getComputedStyle(e)[prop]:null; };
    const body = getComputedStyle(document.body).backgroundColor;
    const btn = document.querySelector('.btn-primary');
    const btn2 = document.querySelector('.btn-secondary');
    return {
      bodyBg: body,
      muted: [get('main p.text-muted','color') || get('main p','color'), body],
      heading: [get('h1','color'), body],
      accent: [get('dt','color'), body],
      primaryBtn: [getComputedStyle(btn).color, getComputedStyle(btn).backgroundColor],
      secondaryBtn: [getComputedStyle(btn2).color, body],
      navInactive: [getComputedStyle(document.querySelectorAll('header nav a')[2]).color, body],
      cardBlurb: [get('.bg-surface p','color'), get('.bg-surface','backgroundColor')],
    };
  });
  for (const [k,v] of Object.entries(pairs)) {
    if (k==='bodyBg') continue;
    const [fg,bg] = v;
    if(!fg||!bg) { console.log(`${k}: MISSING`); continue; }
    const r = ratio(fg,bg);
    const pass = r>=4.5 ? 'PASS AA' : (r>=3 ? 'AA-large only' : 'FAIL');
    console.log(`${k.padEnd(14)} ${r.toFixed(2)}:1  ${pass}   (${fg} on ${bg})`);
  }
  await ctx.close();
}
await b.close();
