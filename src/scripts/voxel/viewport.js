// Some WKWebView hosts resize even svh as their toolbar hides/shows:
// https://bugs.webkit.org/show_bug.cgi?id=255852
// Hold mobile geometry for a given layout width, including after the hero exits.
// Desktop resizing and a phone's orientation/width changes still reflow normally.
export function stableViewport(previous, next) {
  if (!Number.isFinite(next.height) || next.height <= 0 || next.width <= 0) return previous;
  if (previous && next.mobile && previous.mobile === next.mobile &&
      Math.abs(previous.width - next.width) < 2 && previous.orientation === next.orientation) {
    return previous;
  }
  return next;
}

export function bindPortraitViewport(track) {
  const doc = track.ownerDocument, win = doc.defaultView;
  const events = new AbortController();
  const touch = win.matchMedia("(any-pointer: coarse)");
  const probe = doc.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none;overflow-anchor:none;";
  track.appendChild(probe);
  let current;
  function resize() {
    const next = stableViewport(current, {
      width: doc.documentElement.clientWidth,
      height: probe.getBoundingClientRect().height || win.innerHeight,
      mobile: touch.matches || doc.documentElement.clientWidth < 768,
      orientation: win.screen?.orientation?.type ?? win.orientation ?? null,
    });
    if (!next || next === current) return;
    if (!current || next.height !== current.height)
      track.style.setProperty("--portrait-viewport-height", `${next.height}px`);
    current = next;
  }
  function dispose() {
    events.abort();
    probe.remove();
  }
  resize();
  win.addEventListener("resize", resize, { passive: true, signal: events.signal });
  win.addEventListener("pageshow", resize, { signal: events.signal });
  win.addEventListener("pagehide", event => { if (!event.persisted) dispose(); }, { signal: events.signal });
  doc.addEventListener("astro:before-swap", dispose, { signal: events.signal });
  return dispose;
}
