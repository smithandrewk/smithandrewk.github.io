import test from "node:test";
import assert from "node:assert/strict";
import { stableViewport, bindPortraitViewport } from "../src/scripts/voxel/viewport.js";
import { scrollProgress } from "../src/scripts/voxel/motion.js";

const phone = { width: 390, height: 844, mobile: true, orientation: "portrait-primary" };
const bounds = ({ height }) => ({ track: height * 3.2 - 64, sticky: Math.max(768, height - 64) });

test("toolbar expansion and collapse cannot move the end of the Moog scene", () => {
  let viewport = stableViewport(undefined, phone);
  const initial = bounds(viewport), boundary = initial.track - initial.sticky;
  for (const height of [780, 810, 844, 900, 780, 844]) {
    viewport = stableViewport(viewport, { ...phone, height });
    assert.deepEqual(bounds(viewport), initial);
    const { track, sticky } = bounds(viewport);
    assert.equal(scrollProgress(boundary + 12, 0, track, sticky), 1);
    assert.ok(scrollProgress(boundary - 12, 0, track, sticky) < 1);
  }
});

test("rotation, a genuine width change, and desktop resizing still update layout", () => {
  const landscape = { width: 844, height: 390, mobile: true, orientation: "landscape-primary" };
  assert.equal(stableViewport(phone, landscape), landscape);
  const split = { ...phone, width: 360, height: 720 };
  assert.equal(stableViewport(phone, split), split);
  const desktop = { width: 1280, height: 900, mobile: false, orientation: "landscape-primary" };
  const shorter = { ...desktop, height: 720 };
  assert.equal(stableViewport(desktop, shorter), shorter);
  assert.equal(stableViewport(phone, { ...phone, height: 0 }), phone);
});

test("binding locks CSS early, survives back-forward cache, and cleans up listeners", () => {
  const win = new EventTarget(), doc = new EventTarget();
  let measuredHeight = 844, removed = false;
  const writes = [];
  const probe = { style: {}, setAttribute() {}, getBoundingClientRect: () => ({ height: measuredHeight }), remove() { removed = true; } };
  Object.assign(win, { innerHeight: 844, matchMedia: () => ({ matches: true }), screen: { orientation: { type: "portrait-primary" } } });
  Object.assign(doc, { defaultView: win, documentElement: { clientWidth: 390 }, createElement: () => probe });
  const track = { ownerDocument: doc, appendChild() {}, style: { setProperty: (...args) => writes.push(args) } };
  bindPortraitViewport(track);
  assert.deepEqual(writes, [["--portrait-viewport-height", "844px"]]);
  measuredHeight = 780;
  win.dispatchEvent(new Event("resize"));
  assert.equal(writes.length, 1);
  const pagehide = new Event("pagehide"); pagehide.persisted = true;
  win.dispatchEvent(pagehide); win.dispatchEvent(new Event("pageshow"));
  assert.equal(removed, false);
  assert.equal(writes.length, 1);
  doc.documentElement.clientWidth = 844; measuredHeight = 390;
  win.screen.orientation.type = "landscape-primary";
  win.dispatchEvent(new Event("resize"));
  assert.deepEqual(writes.at(-1), ["--portrait-viewport-height", "390px"]);
  doc.dispatchEvent(new Event("astro:before-swap"));
  assert.equal(removed, true);
  doc.documentElement.clientWidth = 390; measuredHeight = 844;
  win.dispatchEvent(new Event("resize"));
  assert.equal(writes.length, 2);
});
