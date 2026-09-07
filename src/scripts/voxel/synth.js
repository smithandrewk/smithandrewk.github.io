// A small, original analog-style voice. No samples, audio downloads, or autoplay.
// AudioContext is created/resumed only by an explicit musical interaction:
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
export const noteFrequency = midi => 440 * 2 ** ((midi - 69) / 12);
export const filterFrequency = value => 140 * (6000 / 140) ** Math.max(0, Math.min(1, value));
export const noteName = midi => `${['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][midi % 12]}${Math.floor(midi / 12) - 1}`;

export function makeVoiceGraph(context) {
  const amp = context.createGain(), master = context.createGain();
  const filter = context.createBiquadFilter(), second = context.createBiquadFilter();
  filter.type = second.type = 'lowpass';
  filter.Q.value = 1.8; second.Q.value = .6;
  amp.gain.value = 0; master.gain.value = .65;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 4;
  const analyser = context.createAnalyser(); analyser.fftSize = 1024;
  const oscillators = [['sawtooth', -4, .28, 1], ['sawtooth', 4, .22, 1], ['triangle', 0, .17, .5]].map(([type, detune, volume, octave]) => {
    const oscillator = context.createOscillator(), level = context.createGain();
    oscillator.type = type; oscillator.detune.value = detune; level.gain.value = volume;
    oscillator.connect(level).connect(filter); oscillator.start();
    return { oscillator, octave };
  });
  filter.connect(second).connect(amp).connect(compressor);
  // A very short, quiet echo gives single notes a little air.
  const delay = context.createDelay(), feedback = context.createGain(), wet = context.createGain();
  delay.delayTime.value = .19; feedback.gain.value = .2; wet.gain.value = .16;
  amp.connect(delay); delay.connect(feedback).connect(delay); delay.connect(wet).connect(compressor);
  compressor.connect(analyser).connect(master).connect(context.destination);
  return { amp, filter, second, analyser, oscillators };
}

export function createSynth({ contextFactory = () => new (window.AudioContext || window.webkitAudioContext)(), onError = () => {} } = {}) {
  let context, graph, cutoff = .52, idleTimer, disposed = false;
  const held = new Map(), samples = new Uint8Array(1024);
  const latest = () => [...held.values()].at(-1)?.midi ?? null;
  function tune() {
    if (!graph || context.state !== 'running') return;
    const now = context.currentTime, midi = latest();
    const gain = graph.amp.gain;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(midi === null ? 0 : .24, now, midi === null ? .075 : .012);
    if (midi !== null) {
      for (const { oscillator, octave } of graph.oscillators) oscillator.frequency.setTargetAtTime(noteFrequency(midi) * octave, now, .012);
    }
    const frequency = filterFrequency(cutoff);
    graph.filter.frequency.setTargetAtTime(frequency, now, .035);
    graph.second.frequency.setTargetAtTime(frequency * 1.25, now, .035);
  }
  async function wake() {
    if (disposed) return false;
    clearTimeout(idleTimer);
    try {
      if (!context) { context = contextFactory(); graph = makeVoiceGraph(context); }
      if (context.state !== 'running') await context.resume();
      if (disposed) return false;
      tune();
      return context.state === 'running';
    } catch { onError(); return false; }
  }
  function rest() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!held.size && context?.state === 'running') context.suspend().catch(() => {});
    }, 1100);
  }
  function noteOn(midi, id) {
    if (disposed || !Number.isInteger(midi) || midi < 48 || midi > 84) return;
    noteOff(id);
    // A lost keyup can never leave the voice running indefinitely.
    held.set(id, { midi, timeout: setTimeout(() => noteOff(id), 12000) });
    void wake();
  }
  function noteOff(id) {
    if (!held.has(id)) return false;
    clearTimeout(held.get(id)?.timeout);
    held.delete(id); tune();
    if (!held.size) rest();
    return true;
  }
  function silence() {
    for (const note of held.values()) clearTimeout(note.timeout);
    held.clear(); tune(); rest();
  }
  return {
    noteOn, noteOff, silence,
    setCutoff(value) { cutoff = Math.max(0, Math.min(1, value)); tune(); },
    get note() { return latest(); },
    get cutoff() { return cutoff; },
    waveform() { if (!graph) return null; graph.analyser.getByteTimeDomainData(samples); return samples; },
    dispose() {
      disposed = true; silence(); clearTimeout(idleTimer);
      if (context && context.state !== 'closed') context.close().catch(() => {});
    },
  };
}
