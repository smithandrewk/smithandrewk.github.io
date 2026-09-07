// Touch notes are committed on a tap, so an ordinary vertical page swipe stays silent.
// Desktop keys sustain while held; horizontal movement on the knob changes cutoff.
export function bindInstrumentInput(stage, { enabled, pick, press, release, getCutoff, setCutoff, signal }) {
  let gesture = null;
  function cancel() { if (gesture?.sounding) release('surface'); gesture = null; }
  function begin(x, y, kind, id) {
    cancel();
    if (!enabled()) return;
    const hit = pick(x, y);
    if (!hit) return;
    gesture = { kind, id, hit, x, y, cutoff: getCutoff(), moved: false, sounding: false };
    if (kind === 'mouse' && hit.midi !== undefined) {
      press(hit.midi, 'surface'); gesture.sounding = true;
    }
  }
  function move(x, y) {
    if (!gesture || !enabled()) { cancel(); return false; }
    const dx = x - gesture.x, dy = y - gesture.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return false;
    gesture.moved = true;
    if (gesture.hit.control === 'cutoff' && Math.abs(dx) > Math.abs(dy) * 1.2) {
      setCutoff(gesture.cutoff + dx / 160); return true;
    }
    cancel(); return false;
  }
  function finish() {
    if (gesture && enabled() && !gesture.moved && !gesture.sounding && gesture.hit.midi !== undefined) {
      press(gesture.hit.midi, 'tap', true);
    }
    cancel();
  }
  stage.addEventListener('pointerdown', e => {
    if (e.isPrimary === false || (e.pointerType !== 'touch' && e.button !== 0)) { cancel(); return; }
    begin(e.clientX, e.clientY, e.pointerType === 'touch' ? 'pointer-touch' : 'mouse', e.pointerId);
  }, { signal });
  stage.addEventListener('pointermove', e => {
    if (gesture?.kind !== 'touch' && gesture?.id === e.pointerId) move(e.clientX, e.clientY);
  }, { signal });
  stage.addEventListener('pointerup', e => {
    if (gesture?.kind !== 'touch' && gesture?.id === e.pointerId) finish();
  }, { signal });
  stage.addEventListener('pointercancel', () => { if (gesture?.kind !== 'touch') cancel(); }, { signal });
  stage.addEventListener('pointerleave', () => { if (gesture?.kind === 'mouse') cancel(); }, { signal });
  stage.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { cancel(); return; }
    const t = e.touches[0]; begin(t.clientX, t.clientY, 'touch', t.identifier);
  }, { signal, passive: true });
  stage.addEventListener('touchmove', e => {
    if (e.touches.length !== 1) { cancel(); return; }
    const t = [...e.touches].find(t => t.identifier === gesture?.id);
    if (gesture?.kind === 'touch' && t && move(t.clientX, t.clientY) && e.cancelable) e.preventDefault();
  }, { signal, passive: false });
  stage.addEventListener('touchend', () => { if (gesture?.kind === 'touch') finish(); }, { signal });
  stage.addEventListener('touchcancel', cancel, { signal });
  stage.ownerDocument.defaultView.addEventListener('blur', cancel, { signal });
  signal.addEventListener('abort', cancel, { once: true });
  return cancel;
}
