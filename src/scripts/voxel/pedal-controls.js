import { bindInstrumentInput } from './instrument-input.js';

export function mountPedalControls(track, { getValue, setValue, signal }) {
  const ui = track.querySelector('[data-pedal-ui]'), panel = track.querySelector('[data-pedal-panel]');
  const toggle = track.querySelector('[data-pedal-toggle]'), close = track.querySelector('[data-pedal-close]');
  const bypass = track.querySelector('[data-pedal-bypass]'), dials = [...track.querySelectorAll('[data-pedal-dial]')];
  function show(value) { panel.hidden = !value; toggle.setAttribute('aria-expanded', String(value)); }
  toggle.addEventListener('click', () => show(panel.hidden), { signal });
  close.addEventListener('click', () => { show(false); toggle.focus({ preventScroll: true }); }, { signal });
  bypass.addEventListener('click', () => setValue({ enabled: !getValue().enabled }), { signal });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); show(false); toggle.focus({ preventScroll: true }); }
  }, { signal });
  const cancel = dials.map(dial => {
    const name = dial.dataset.pedalDial;
    dial.addEventListener('keydown', e => {
      const changes = { ArrowUp: .01, ArrowRight: .01, ArrowDown: -.01, ArrowLeft: -.01, PageUp: .1, PageDown: -.1 };
      if (!(e.key in changes) && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault(); e.stopPropagation();
      setValue({ [name]: e.key === 'Home' ? 0 : e.key === 'End' ? 1 : getValue()[name] + changes[e.key] });
    }, { signal });
    return bindInstrumentInput(dial, {
      enabled: () => !ui.hidden && !panel.hidden, pick: () => ({ control: name }),
      getCutoff: () => 0, setCutoff() {}, getControl: () => getValue()[name],
      setControl: (control, value) => setValue({ [control]: value }),
      signal, independentTouch: true, onStart: () => dial.focus({ preventScroll: true }),
    });
  });
  return {
    setVisible(visible) { ui.hidden = !visible; if (!visible) { show(false); cancel.forEach(fn => fn()); } },
    sync() {
      const value = getValue();
      for (const dial of dials) {
        const name = dial.dataset.pedalDial, percent = Math.round(value[name] * 100);
        const label = name === 'mix' ? `${percent}%` : percent < 25 ? 'Small room' : percent < 65 ? 'Open room' : percent < 90 ? 'Wide hall' : 'Vast hall';
        dial.style.setProperty('--turn', `${(value[name] - .5) * 260}deg`);
        dial.setAttribute('aria-valuenow', String(percent)); dial.setAttribute('aria-valuetext', label);
        track.querySelector(`[data-pedal-value="${name}"]`).textContent = label;
      }
      track.querySelector('[data-pedal-summary]').textContent = value.enabled ? `${Math.round(value.mix * 100)}%` : 'OFF';
      track.querySelector('[data-pedal-light]').toggleAttribute('data-bypassed', !value.enabled);
      track.querySelector('[data-pedal-switch-label]').textContent = value.enabled ? 'ON' : 'BYPASSED';
      bypass.setAttribute('aria-pressed', String(value.enabled));
    },
    cancel() { cancel.forEach(fn => fn()); },
  };
}
