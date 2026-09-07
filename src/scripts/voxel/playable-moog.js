import { createSynth, filterFrequency, noteName } from './synth.js';
import { bindInstrumentInput } from './instrument-input.js';

const shortcuts = new Map('awsedftgyhujk'.split('').map((key, i) => [key, 60 + i]));
export function mountPlayableMoog(track, stage, performance, camera, requestDraw, signal) {
  const invite = track.querySelector('[data-instrument-invite]');
  const openButton = track.querySelector('[data-instrument-open]');
  const controls = track.querySelector('[data-instrument-controls]');
  const closeButton = track.querySelector('[data-instrument-close]');
  const slider = track.querySelector('[data-instrument-filter]');
  const frequency = track.querySelector('[data-instrument-frequency]');
  const readout = track.querySelector('[data-instrument-note]');
  const status = track.querySelector('[data-instrument-status]');
  const keys = [...track.querySelectorAll('[data-midi]')];
  const synth = createSynth({ onError() {
    status.textContent = 'Sound could not start. Try another key, or open this page in Safari or Chrome.';
    readout.textContent = 'SOUND PAUSED';
  } });
  const state = { focus: 0, cutoff: .52, depths: new Float32Array(37), leftX: 0, rightX: 0, leftPress: 0, rightPress: 0, wave: null, moving: false };
  let open = false, available = false, tail = 0, enteredAtScroll = 0;
  let leftTarget = 0, rightTarget = 0, tapTimer, lastMouseButton = null, lastNote = null;
  const mouseNotes = new Map();
  function release(id) { if (synth.noteOff(id)) { tail = 1.1; requestDraw(); } }
  function press(midi, id, tap = false) {
    if (!open || !available) return;
    if (tap) clearTimeout(tapTimer);
    synth.noteOn(midi, id); tail = 1.1; lastNote = midi;
    const key = performance.keyData.find(key => key.midi === midi);
    if (key.x >= 0) leftTarget = key.x - 4.8; else rightTarget = key.x + 4.8;
    status.textContent = '';
    requestDraw();
    if (tap) tapTimer = setTimeout(() => release(id), 420);
  }
  function stop() {
    clearTimeout(tapTimer); mouseNotes.clear(); synth.silence(); tail = 1.1; requestDraw();
  }
  function setOpen(value, focus = false) {
    open = Boolean(value && available);
    if (open) {
      enteredAtScroll = window.scrollY;
      track.setAttribute('data-instrument-open', '');
      stage.setAttribute('role', 'group');
      stage.setAttribute('aria-label', 'Playable Moog synthesizer. Tap a key or play with A W S E D F T G Y H U J K.');
      for (const attr of ['aria-valuenow', 'aria-valuetext', 'aria-valuemin', 'aria-valuemax', 'aria-orientation']) stage.removeAttribute(attr);
      if (focus) stage.focus({ preventScroll: true });
    } else {
      stop(); leftTarget = rightTarget = 0; lastNote = null;
      track.removeAttribute('data-instrument-open');
      stage.setAttribute('role', 'slider'); stage.setAttribute('aria-label', "Rotate Andrew's 3D portrait");
      stage.setAttribute('aria-orientation', 'horizontal'); stage.setAttribute('aria-valuemin', '-180'); stage.setAttribute('aria-valuemax', '180');
    }
    controls.hidden = !open; invite.hidden = !available || open;
    openButton.setAttribute('aria-expanded', String(open));
    track.querySelector('[data-voxel-help]').textContent = open
      ? 'Tap the 3D keys or use A W S E D F T G Y H U J K to play. Drag the gold knob sideways or use the Tone slider to change the filter. Escape returns to the portrait. Scrolling away stops the sound.'
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'Drag sideways or use the arrow keys to rotate. Escape resets the view.'
        : 'Drag sideways or use the arrow keys to rotate. Scroll or use Page Up and Page Down to assemble the portrait, then take a seat at a Moog Subsequent 37. Escape resets the view.';
    if (!open && focus && available) openButton.focus({ preventScroll: true });
    requestDraw();
  }
  function setCutoff(value) {
    synth.setCutoff(value); state.cutoff = synth.cutoff;
    slider.value = String(Math.round(synth.cutoff * 100));
    const hz = filterFrequency(synth.cutoff);
    frequency.textContent = hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
    slider.setAttribute('aria-valuetext', `${Math.round(hz)} hertz`); requestDraw();
  }
  const cancelGesture = bindInstrumentInput(stage, {
    enabled: () => open && state.focus > .96,
    pick(x, y) {
      const rect = stage.getBoundingClientRect();
      return performance.pick(camera, (x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    }, press, release, getCutoff: () => synth.cutoff, setCutoff, signal,
  });
  openButton.addEventListener('click', () => setOpen(true, true), { signal });
  closeButton.addEventListener('click', () => setOpen(false, true), { signal });
  slider.addEventListener('input', () => setCutoff(Number(slider.value) / 100), { signal });
  for (const button of keys) {
    const midi = Number(button.dataset.midi);
    button.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') { lastMouseButton = null; return; }
      if (e.button !== 0) return;
      lastMouseButton = button;
      const id = `button-${e.pointerId}`; mouseNotes.set(e.pointerId, id); press(midi, id);
    }, { signal });
    button.addEventListener('click', e => {
      if (e.detail > 0 && lastMouseButton === button) { lastMouseButton = null; return; }
      press(midi, 'tap', true);
    }, { signal });
  }
  for (const event of ['pointerup', 'pointercancel']) window.addEventListener(event, e => {
    const id = mouseNotes.get(e.pointerId);
    if (id) { release(id); mouseNotes.delete(e.pointerId); }
  }, { signal });
  track.addEventListener('keydown', e => {
    if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false, true); return; }
    if (e.target.tagName === 'INPUT') return;
    const midi = shortcuts.get(e.key.toLowerCase());
    if (midi === undefined) return;
    e.preventDefault(); if (!e.repeat) press(midi, `keyboard-${e.key.toLowerCase()}`);
  }, { signal });
  window.addEventListener('keyup', e => { if (shortcuts.has(e.key.toLowerCase())) release(`keyboard-${e.key.toLowerCase()}`); }, { signal });
  window.addEventListener('blur', () => { cancelGesture(); stop(); }, { signal });
  window.addEventListener('pagehide', stop, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, { signal });
  window.addEventListener('scroll', () => {
    if (open && Math.abs(window.scrollY - enteredAtScroll) > 20) { cancelGesture(); setOpen(false); }
  }, { signal, passive: true });
  setCutoff(.52);
  return {
    get open() { return open; },
    get available() { return available; },
    get animating() { return state.moving || tail > 0 || synth.note !== null; },
    stop,
    update(dt, canPlay) {
      available = canPlay && Boolean(window.AudioContext || window.webkitAudioContext);
      if (!available && open) setOpen(false);
      invite.hidden = !available || open;
      const lerp = (from, to, rate = 16) => Math.abs(to - from) < .001 ? to : from + (to - from) * (1 - Math.exp(-dt * rate));
      state.moving = false;
      const approach = (key, target, rate) => { state[key] = lerp(state[key], target, rate); state.moving ||= state[key] !== target; };
      approach('focus', open ? 1 : 0, 8);
      approach('leftX', open ? leftTarget : 0); approach('rightX', open ? rightTarget : 0);
      const note = synth.note, active = performance.keyData.find(key => key.midi === note);
      approach('leftPress', active?.x >= 0 ? 1 : 0, 24); approach('rightPress', active?.x < 0 ? 1 : 0, 24);
      for (let i = 0; i < state.depths.length; i++) {
        const target = performance.keyData[i].midi === note ? 1 : 0;
        state.depths[i] = lerp(state.depths[i], target, 28);
        state.moving ||= Math.abs(state.depths[i] - target) > .001;
      }
      tail = Math.max(0, tail - dt);
      state.wave = open && (note !== null || tail > 0) ? synth.waveform() : null;
      if (note === null) delete track.dataset.note; else track.dataset.note = noteName(note);
      if (!status.textContent) readout.textContent = (note ?? lastNote) === null ? 'YOUR TURN' : noteName(note ?? lastNote);
      for (const button of keys) button.toggleAttribute('data-pressed', Number(button.dataset.midi) === note);
      return state;
    },
    dispose() { clearTimeout(tapTimer); synth.dispose(); controls.hidden = invite.hidden = true; },
  };
}
