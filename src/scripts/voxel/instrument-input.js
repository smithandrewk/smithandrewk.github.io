// Only the projected keys/knob and compact keyboard reserve touch gestures.
// The surrounding portrait keeps native scrolling and pinch zoom.
export function bindInstrumentInput(surface, { enabled, pick, slide = pick, press, release, getCutoff, setCutoff, getControl = getCutoff, setControl = (control, value) => setCutoff(value), activate = () => {}, independentTouch = false, signal, source = 'surface', onStart = () => {} }) {
  let gesture = null;
  const win = surface.ownerDocument.defaultView;
  const touchEvents = 'ontouchstart' in win;
  function cancel() {
    const previous = gesture; gesture = null;
    if (previous?.sounding) release(source);
    if (previous?.kind === 'pointer' && surface.hasPointerCapture?.(previous.id)) surface.releasePointerCapture(previous.id);
  }
  function begin(x, y, kind, id) {
    cancel();
    if (!enabled()) return false;
    const hit = pick(x, y);
    if (!hit) return false;
    onStart();
    gesture = { kind, id, hit, x, y, cutoff: hit.control ? getControl(hit.control) : getCutoff(), midi: hit.midi, sounding: hit.midi !== undefined, pitchMoved: false };
    if (hit.control === 'bypass') activate('bypass');
    if (gesture.sounding) press(hit.midi, source);
    if (kind === 'pointer') surface.setPointerCapture?.(id);
    return true;
  }
  function move(x, y) {
    if (!gesture || !enabled()) { cancel(); return false; }
    const dx = x - gesture.x, dy = y - gesture.y;
    if (gesture.hit.control) {
      if (gesture.hit.control !== 'bypass') setControl(gesture.hit.control, gesture.cutoff + dx / 160 - dy / 180);
    } else {
      gesture.pitchMoved ||= Math.abs(dx) > 3;
      const note = gesture.pitchMoved ? slide(x, gesture.y, gesture.hit, gesture.x)?.midi : gesture.midi;
      if (note !== undefined && note !== gesture.midi) { gesture.midi = note; press(note, source); }
      if (Math.abs(dy) > 3) setCutoff(gesture.cutoff - dy / 180);
    }
    return true;
  }
  surface.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' && touchEvents) return;
    if (e.isPrimary === false || (e.pointerType !== 'touch' && e.button !== 0)) { cancel(); return; }
    if (begin(e.clientX, e.clientY, 'pointer', e.pointerId) && e.cancelable) e.preventDefault();
  }, { signal });
  surface.addEventListener('pointermove', e => {
    if (gesture?.kind === 'pointer' && gesture.id === e.pointerId && move(e.clientX, e.clientY) && e.cancelable) e.preventDefault();
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) surface.addEventListener(type, e => {
    if (gesture?.kind === 'pointer' && gesture.id === e.pointerId) cancel();
  }, { signal });
  surface.addEventListener('touchstart', e => {
    // Separate controls can each own one finger: hold a key with one hand and
    // turn the larger pedal knob with the other. Two fingers on this same
    // surface still cancel instead of unexpectedly replacing a held note.
    if (independentTouch ? gesture?.kind === 'touch' : e.touches.length !== 1) { cancel(); return; }
    const t = independentTouch ? e.changedTouches?.[0] ?? e.touches[0] : e.touches[0];
    if (begin(t.clientX, t.clientY, 'touch', t.identifier) && e.cancelable) e.preventDefault();
  }, { signal, passive: false });
  surface.addEventListener('touchmove', e => {
    if (!independentTouch && e.touches.length !== 1) { cancel(); return; }
    const t = [...e.touches].find(t => t.identifier === gesture?.id);
    if (gesture?.kind === 'touch' && t && move(t.clientX, t.clientY) && e.cancelable) e.preventDefault();
  }, { signal, passive: false });
  surface.addEventListener('touchend', e => {
    if (gesture?.kind === 'touch' && ![...e.touches].some(t => t.identifier === gesture.id)) cancel();
  }, { signal });
  surface.addEventListener('touchcancel', cancel, { signal });
  win.addEventListener('blur', cancel, { signal });
  signal.addEventListener('abort', cancel, { once: true });
  return cancel;
}
