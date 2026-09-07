// A small, original analog-style voice. No samples, audio downloads, or autoplay.
// AudioContext is created/resumed only by an explicit musical interaction:
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
import { createPlaybackSession } from './playback-session.js';
const REVERB_SECONDS = 1.8;
// Let the envelope and room decay finish before suspending audio or its scope.
export const AUDIO_TAIL_SECONDS = REVERB_SECONDS + .6;
export const noteFrequency = midi => 440 * 2 ** ((midi - 69) / 12);
export const filterFrequency = value => 140 * (6000 / 140) ** Math.max(0, Math.min(1, value));
export const noteName = midi => `${['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][midi % 12]}${Math.floor(midi / 12) - 1}`;

function roomImpulse(context) {
  const rate = context.sampleRate, length = Math.ceil(rate * REVERB_SECONDS);
  const buffer = context.createBuffer(2, length, rate), preDelay = Math.round(rate * .018);
  // A generated stereo room: no asset fetch on the first note. Independent
  // channels add width, with a short pre-delay to preserve the key's attack.
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    let seed = 37 + channel * 7919;
    for (let i = preDelay; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const t = (i - preDelay) / (length - preDelay);
      const fade = Math.min(1, (length - 1 - i) / (rate * .04));
      samples[i] = (seed / 2147483648 - 1) * Math.exp(-6.91 * t) * fade;
    }
  }
  return buffer;
}

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
  // Keep the direct voice clear, with a warm room underneath every note.
  // Filtering only the reverb prevents low notes from building up in the room.
  const reverb = context.createConvolver(), wet = context.createGain();
  const lowCut = context.createBiquadFilter(), highCut = context.createBiquadFilter();
  lowCut.type = 'highpass'; lowCut.frequency.value = 180; lowCut.Q.value = .707;
  highCut.type = 'lowpass'; highCut.frequency.value = 4200; highCut.Q.value = .707;
  reverb.normalize = true; reverb.buffer = roomImpulse(context); wet.gain.value = .32;
  amp.connect(lowCut).connect(reverb).connect(highCut).connect(wet).connect(compressor);
  compressor.connect(analyser).connect(master).connect(context.destination);
  return { amp, filter, second, analyser, oscillators, reverbWet: wet };
}

export function createSynth({ contextFactory = () => new (window.AudioContext || window.webkitAudioContext)(), onError = () => {}, playbackSession = createPlaybackSession() } = {}) {
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
      playbackSession.acquire();
      if (!context) { context = contextFactory(); graph = makeVoiceGraph(context); }
      if (context.state !== 'running') await context.resume();
      if (disposed) return false;
      tune();
      return context.state === 'running';
    } catch { playbackSession.release(); onError(); return false; }
  }
  function rest() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      if (held.size) return;
      try { if (context?.state === 'running') await context.suspend(); } catch {}
      // A finger can land while suspension is pending. Resume that newer note.
      if (held.size && !disposed) void wake(); else playbackSession.release();
    }, AUDIO_TAIL_SECONDS * 1000);
  }
  function noteOn(midi, id) {
    if (disposed || !Number.isInteger(midi) || midi < 48 || midi > 84) return;
    // Changing pitch under one finger keeps the gate open (legato).
    clearTimeout(held.get(id)?.timeout);
    held.delete(id);
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
      playbackSession.release();
      if (context && context.state !== 'closed') context.close().catch(() => {});
    },
  };
}
