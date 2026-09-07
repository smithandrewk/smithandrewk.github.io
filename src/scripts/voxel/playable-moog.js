import { createSynth, filterFrequency, noteName, AUDIO_TAIL_SECONDS } from './synth.js';
import { bindInstrumentInput } from './instrument-input.js';
import { createPlayDiscovery } from './play-discovery.js';

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
  const keyboard = track.querySelector('[data-instrument-keyboard]');
  const keyArea = track.querySelector('[data-instrument-hitarea="keys"]');
  const knobArea = track.querySelector('[data-instrument-hitarea="knob"]');
  const keys = [...track.querySelectorAll('[data-midi]')];
  const discovery = createPlayDiscovery(), cancellers = [];
  const synth = createSynth({ onError() {
    status.textContent = 'Sound could not start. Try another key, or open this page in Safari or Chrome.';
    readout.textContent = 'SOUND PAUSED';
  } });
  const state = { focus: 0, cutoff: .52, depths: new Float32Array(37), leftX: 0, rightX: 0, leftPress: 0, rightPress: 0, wave: null, moving: false };
  let open = false, available = false, tail = 0, enteredAtScroll = 0, projected = null;
  let leftTarget = 0, rightTarget = 0, tapTimer, lastNote = null;
  function release(id) { if (synth.noteOff(id)) { tail = AUDIO_TAIL_SECONDS; requestDraw(); } }
  function press(midi, id, tap = false) {
    if (!open || !available) return;
    if (tap) clearTimeout(tapTimer);
    synth.noteOn(midi, id); tail = AUDIO_TAIL_SECONDS; lastNote = midi;
    const key = performance.keyData.find(key => key.midi === midi);
    if (key.x >= 0) leftTarget = key.x - 4.8; else rightTarget = key.x + 4.8;
    status.textContent = '';
    requestDraw();
    if (tap) tapTimer = setTimeout(() => release(id), 420);
  }
  function stop() {
    for (const cancel of cancellers) cancel();
    clearTimeout(tapTimer); synth.silence(); tail = AUDIO_TAIL_SECONDS; requestDraw();
  }
  function setOpen(value, focus = false) {
    open = Boolean(value && available);
    if (open) {
      enteredAtScroll = window.scrollY;
      track.setAttribute('data-instrument-open', '');
      stage.setAttribute('role', 'group');
      stage.setAttribute('aria-label', 'Playable Moog synthesizer. Hold a key and slide sideways for notes, up or down for tone.');
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
      ? 'Hold a key and slide left or right to change notes. Move up for a brighter tone or down for a warmer tone. You can also play with A W S E D F T G Y H U J K. Scroll outside the keys to continue. Escape returns to the portrait.'
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'Drag sideways or use the arrow keys to rotate. Escape resets the view.'
        : 'Drag sideways or use the arrow keys to rotate. Scroll to assemble the portrait, take a seat at the Moog, then bring its playable keyboard into view. Escape resets the view.';
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
  function nearestNote(points, x, hit, startX) {
    const anchor = points.find(point => point.midi === hit.midi);
    const desiredX = x + (anchor ? anchor.x - startX : 0);
    return points.reduce((best, point) => !best || Math.abs(point.x - desiredX) < Math.abs(best.x - desiredX) ? point : best, null);
  }
  const input = { press, release, getCutoff: () => synth.cutoff, setCutoff, signal, onStart: () => stage.focus({ preventScroll: true }) };
  cancellers.push(bindInstrumentInput(stage, {
    ...input, enabled: () => open && state.focus > .96,
    pick(x, y) {
      const rect = stage.getBoundingClientRect();
      return performance.pick(camera, (x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    },
    slide(x, y, hit, startX) {
      if (!projected) return null;
      const rect = stage.getBoundingClientRect(), normalize = value => (value - rect.left) / rect.width * 2 - 1;
      return nearestNote(projected.notes, normalize(x), hit, normalize(startX));
    },
  }));
  cancellers.push(bindInstrumentInput(keyboard, {
    ...input, source: 'keyboard-surface', enabled: () => open && available,
    pick(x, y) {
      const button = keyboard.ownerDocument.elementFromPoint(x, y)?.closest('[data-midi]');
      return button && keyboard.contains(button) ? { midi: Number(button.dataset.midi) } : null;
    },
    slide(x, y, hit, startX) {
      return nearestNote(keys.map(button => { const r = button.getBoundingClientRect(); return { midi: Number(button.dataset.midi), x: r.left + r.width / 2 }; }), x, hit, startX);
    },
  }));
  openButton.addEventListener('click', () => { discovery.enter(); setOpen(true, true); }, { signal });
  const dismiss = () => { discovery.dismiss(); setOpen(false, true); };
  closeButton.addEventListener('click', dismiss, { signal });
  slider.addEventListener('input', () => setCutoff(Number(slider.value) / 100), { signal });
  for (const button of keys) button.addEventListener('click', e => {
    // Pointer and touch gestures are handled above. Keyboard/AT activation still
    // gets a short note without requiring a drag-capable input device.
    if (e.detail === 0) press(Number(button.dataset.midi), 'tap', true);
  }, { signal });
  track.addEventListener('keydown', e => {
    if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); dismiss(); return; }
    if (e.target.tagName === 'INPUT') return;
    const midi = shortcuts.get(e.key.toLowerCase());
    if (midi === undefined) return;
    e.preventDefault(); if (!e.repeat) press(midi, `keyboard-${e.key.toLowerCase()}`);
  }, { signal });
  window.addEventListener('keyup', e => { if (shortcuts.has(e.key.toLowerCase())) release(`keyboard-${e.key.toLowerCase()}`); }, { signal });
  window.addEventListener('blur', stop, { signal });
  window.addEventListener('pagehide', stop, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, { signal });
  window.addEventListener('scroll', () => {
    if (open && Math.abs(window.scrollY - enteredAtScroll) > 20) {
      stop(); discovery.scroll(); enteredAtScroll = window.scrollY;
    }
  }, { signal, passive: true });
  setCutoff(.52);
  return {
    get open() { return open; },
    get available() { return available; },
    get animating() { return state.moving || tail > 0 || synth.note !== null; },
    stop,
    update(dt, canPlay, reveal = 0) {
      available = canPlay && Boolean(window.AudioContext || window.webkitAudioContext);
      const discovered = discovery.update(available, reveal);
      if (discovered.open !== open) setOpen(discovered.open);
      invite.hidden = !available || open;
      const lerp = (from, to, rate = 16) => Math.abs(to - from) < .001 ? to : from + (to - from) * (1 - Math.exp(-dt * rate));
      state.moving = false;
      const approach = (key, target, rate) => { state[key] = lerp(state[key], target, rate); state.moving ||= state[key] !== target; };
      approach('focus', discovered.focus, 10);
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
    updateHitAreas() {
      const enabled = open && state.focus > .96;
      keyArea.hidden = knobArea.hidden = !enabled;
      if (!enabled) return;
      projected = performance.projectControls(camera);
      keyArea.style.clipPath = `polygon(${projected.keys.map(([x, y]) => `${(x + 1) * 50}% ${(1 - y) * 50}%`).join(',')})`;
      const [x, y] = projected.knob;
      knobArea.style.clipPath = `circle(18px at ${(x + 1) * 50}% ${(1 - y) * 50}%)`;
    },
    dispose() { clearTimeout(tapTimer); synth.dispose(); controls.hidden = invite.hidden = keyArea.hidden = knobArea.hidden = true; },
  };
}
