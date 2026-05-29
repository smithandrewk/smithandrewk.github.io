import { test, expect, Page } from "@playwright/test";

const URL = "/orbit/";

type Viewport = { name: "mobile" | "desktop"; width: number; height: number };
const VIEWPORTS: Viewport[] = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
];

// Shape of the data we collect inside the page.
type Instrumentation = {
  totalCLS: number;
  topShifts: Array<{
    value: number;
    tag: string | null;
    cls: string | null;
    rect: { x: number; y: number; width: number; height: number } | null;
  }>;
  scMapMutations: number;
  scMapMutationLog: Array<{ t: number; attr: string; value: string | null }>;
  flyToggles: Record<string, number>;
  scrollHeightBefore: number;
  scrollyHeightBefore: number;
};

declare global {
  interface Window {
    __instr: {
      cls: number;
      shifts: Array<{ value: number; tag: string | null; cls: string | null; rect: any }>;
      scMapMutations: number;
      scMapLog: Array<{ t: number; attr: string; value: string | null }>;
      fly: Record<string, number>;
      scrollHeightBefore: number;
      scrollyHeightBefore: number;
    };
  }
}

async function installInstrumentation(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__instr = {
      cls: 0,
      shifts: [],
      scMapMutations: 0,
      scMapLog: [],
      fly: {},
      scrollHeightBefore: 0,
      scrollyHeightBefore: 0,
    };

    // ---- layout-shift observer ----
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          // ignore shifts caused by recent user input
          if (entry.hadRecentInput) continue;
          w.__instr.cls += entry.value;
          const src = entry.sources && entry.sources[0];
          const node: Element | null = src && src.node ? (src.node as Element) : null;
          let rect: any = null;
          try {
            if (node && (node as any).getBoundingClientRect) {
              const r = (node as Element).getBoundingClientRect();
              rect = { x: r.x, y: r.y, width: r.width, height: r.height };
            }
          } catch (e) {}
          w.__instr.shifts.push({
            value: entry.value,
            tag: node ? node.tagName : null,
            cls: node ? (typeof node.className === "string" ? node.className : String((node as any).className?.baseVal ?? "")) : null,
            rect,
          });
        }
      });
      po.observe({ type: "layout-shift", buffered: true } as any);
    } catch (e) {
      // layout-shift not supported
    }

    // ---- .sc-map class/style mutation observer ----
    const scMap = document.querySelector(".sc-map");
    if (scMap) {
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          w.__instr.scMapMutations++;
          const attr = m.attributeName || "?";
          const val = attr === "class"
            ? (scMap as Element).getAttribute("class")
            : (scMap as Element).getAttribute("style");
          w.__instr.scMapLog.push({ t: performance.now(), attr, value: val });
        }
      });
      mo.observe(scMap, { attributes: true, attributeFilter: ["class", "style"] });
    }

    // ---- .fly-group class mutation observers ----
    document.querySelectorAll(".fly-group").forEach((g) => {
      const city = g.getAttribute("data-city") || "unknown";
      w.__instr.fly[city] = 0;
      const mo = new MutationObserver(() => {
        w.__instr.fly[city] = (w.__instr.fly[city] || 0) + 1;
      });
      mo.observe(g, { attributes: true, attributeFilter: ["class"] });
    });

    // ---- baseline heights ----
    w.__instr.scrollHeightBefore = document.documentElement.scrollHeight;
    const scrolly = document.querySelector("#scrolly");
    w.__instr.scrollyHeightBefore = scrolly ? scrolly.getBoundingClientRect().height : 0;
  });
}

async function readInstrumentation(page: Page): Promise<Instrumentation> {
  return await page.evaluate(() => {
    const w = window as any;
    const i = w.__instr;
    const topShifts = [...i.shifts]
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 5);
    const scrolly = document.querySelector("#scrolly");
    return {
      totalCLS: i.cls,
      topShifts,
      scMapMutations: i.scMapMutations,
      scMapMutationLog: i.scMapLog.slice(-12),
      flyToggles: i.fly,
      scrollHeightBefore: i.scrollHeightBefore,
      scrollyHeightBefore: i.scrollyHeightBefore,
      // current values appended for delta comparison
      scrollHeightAfter: document.documentElement.scrollHeight,
      scrollyHeightAfter: scrolly ? scrolly.getBoundingClientRect().height : 0,
    } as any;
  });
}

for (const vp of VIEWPORTS) {
  test(`orbit scroll-up jitter instrumentation [${vp.name}]`, async ({ page }) => {
    const consoleMsgs: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      const loc = msg.location();
      consoleMsgs.push(
        `[${msg.type()}] ${msg.text()} @ ${loc.url}:${loc.lineNumber}:${loc.columnNumber}`
      );
    });
    page.on("pageerror", (err) => {
      pageErrors.push(`[pageerror] ${err.message}\n${err.stack ?? ""}`);
    });

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(URL, { waitUntil: "networkidle" });

    // (a) page mounted
    await expect(page.locator(".map-section")).toHaveCount(1);
    await expect(page.locator(".sc-map")).toHaveCount(1);

    // (b) instrument before scrolling
    await installInstrumentation(page);

    // (c) scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);

    // Find the document-y range of the map scrollytelling block so we can
    // screenshot WITHIN it (the .step-reveal centered, then ~1/~2 steps up).
    const mapRange = await page.evaluate(() => {
      const scrolly = document.querySelector("#scrolly") as HTMLElement;
      const reveal = document.querySelector(".step-reveal") as HTMLElement;
      const top = scrolly.getBoundingClientRect().top + window.scrollY;
      const revealTop = reveal.getBoundingClientRect().top + window.scrollY;
      return {
        top,
        height: scrolly.getBoundingClientRect().height,
        revealCenter: revealTop + reveal.getBoundingClientRect().height / 2 - window.innerHeight / 2,
        vh: window.innerHeight,
      };
    });
    // Three screenshot targets: reveal centered, ~1 viewport up, ~2 up.
    const shotTargets = [
      Math.max(0, mapRange.revealCenter),
      Math.max(0, mapRange.revealCenter - mapRange.vh),
      Math.max(0, mapRange.revealCenter - 2 * mapRange.vh),
    ];

    // (d) + (f) scroll up in 40 steps. Also record requested-vs-actual scroll
    // position at every step to detect smooth-scroll interference / overshoot.
    const STEPS = 40;
    const stepPx = scrollHeight / STEPS;
    const scrollTrace: Array<{ requested: number; actual: number }> = [];

    for (let s = 0; s < STEPS; s++) {
      const target = Math.max(0, scrollHeight - stepPx * (s + 1));
      const actual = await page.evaluate((y) => {
        window.scrollTo(0, y);
        return window.scrollY;
      }, target);
      scrollTrace.push({ requested: Math.round(target), actual: Math.round(actual) });
      await page.waitForTimeout(80);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // (f) Now take the 3 map-section screenshots at precise positions. We
    // disable smooth scroll just for positioning so the shot is where we asked.
    let shotIdx = 0;
    for (const target of shotTargets) {
      shotIdx++;
      await page.evaluate((y) => {
        document.documentElement.style.scrollBehavior = "auto";
        window.scrollTo(0, y);
      }, target);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `screenshots/up-${vp.name}-${shotIdx}.png` });
    }
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "";
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(200);

    // Compute max overshoot/disagreement between requested and actual scroll.
    let maxDelta = 0;
    let nonMono = 0;
    for (let i = 0; i < scrollTrace.length; i++) {
      const d = Math.abs(scrollTrace[i].requested - scrollTrace[i].actual);
      if (d > maxDelta) maxDelta = d;
      if (i > 0 && scrollTrace[i].actual > scrollTrace[i - 1].actual + 2) nonMono++;
    }

    // (e) read back
    const data = (await readInstrumentation(page)) as any;

    const flyEntries = Object.entries(data.flyToggles)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    const shiftLines = data.topShifts
      .map(
        (s: any, idx: number) =>
          `    #${idx + 1} value=${s.value.toFixed(5)} node=<${s.tag}> class="${s.cls}" rect=${
            s.rect ? `${Math.round(s.rect.width)}x${Math.round(s.rect.height)}@(${Math.round(s.rect.x)},${Math.round(s.rect.y)})` : "n/a"
          }`
      )
      .join("\n");
    const scMapTail = data.scMapMutationLog
      .map((m: any) => `      t=${m.t.toFixed(0)} ${m.attr}="${m.value}"`)
      .join("\n");

    console.log(
      `\n=================== REPORT [${vp.name} ${vp.width}x${vp.height}] ===================\n` +
        `Total CLS (scroll-up, excl. recent-input): ${data.totalCLS.toFixed(5)}\n` +
        `Top layout-shift sources:\n${shiftLines || "    (none)"}\n` +
        `.sc-map class/style mutations: ${data.scMapMutations}\n` +
        `  last mutations:\n${scMapTail || "      (none)"}\n` +
        `.fly-group toggle counts: ${flyEntries || "(none)"}\n` +
        `Smooth-scroll interference: maxDelta(requested vs actual)=${maxDelta}px, upward-scroll reversals(actual went DOWN during up-scroll)=${nonMono}\n` +
        `scrollHeight before=${data.scrollHeightBefore} after=${data.scrollHeightAfter} delta=${
          data.scrollHeightAfter - data.scrollHeightBefore
        }\n` +
        `#scrolly rect height before=${Math.round(data.scrollyHeightBefore)} after=${Math.round(
          data.scrollyHeightAfter
        )} delta=${Math.round(data.scrollyHeightAfter - data.scrollyHeightBefore)}\n` +
        `Console messages (${consoleMsgs.length}):\n${
          consoleMsgs.length ? consoleMsgs.map((m) => "    " + m).join("\n") : "    (none)"
        }\n` +
        `Page errors (${pageErrors.length}):\n${
          pageErrors.length ? pageErrors.map((m) => "    " + m).join("\n") : "    (none)"
        }\n` +
        `========================================================================\n`
    );

    // scrollHeight must not change mid-scroll
    expect(data.scrollHeightAfter).toBe(data.scrollHeightBefore);
  });
}
