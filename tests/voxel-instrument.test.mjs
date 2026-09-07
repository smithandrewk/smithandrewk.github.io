import test from 'node:test';
import assert from 'node:assert/strict';
import { bindInstrumentInput } from '../src/scripts/voxel/instrument-input.js';
import { createSynth, noteFrequency, filterFrequency } from '../src/scripts/voxel/synth.js';
import { makeMoogData } from '../src/scripts/voxel/moog-data.js';

function inputHarness() {
  const stage = new EventTarget(), signal = new AbortController();
  stage.ownerDocument = { defaultView: new EventTarget() };
  const notes = [], releases = []; let cutoff = .5, enabled = true;
  bindInstrumentInput(stage, { enabled: () => enabled, pick: x => x < 100 ? { midi: 60 } : { control: 'cutoff' }, press: (...note) => notes.push(note), release: id => releases.push(id), getCutoff: () => cutoff, setCutoff: v => cutoff = v, signal: signal.signal });
  return { notes, releases, signal, stage, get cutoff() { return cutoff; }, disable() { enabled = false; }, send(type, props) { const e = Object.assign(new Event(type, { cancelable: true }), props); stage.dispatchEvent(e); return e; } };
}
const touch = (x, y, identifier = 1) => ({ clientX: x, clientY: y, identifier });
const pointer = (x, y, pointerType = 'touch') => ({ clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType, button: 0 });

test('a mixed pointer/touch tap produces one note, and scroll/pinch gestures stay silent', () => {
  const h = inputHarness();
  h.send('pointerdown', pointer(40, 30)); h.send('touchstart', { touches: [touch(40, 30)] });
  h.send('pointerup', pointer(40, 30)); h.send('touchend', { touches: [] });
  assert.deepEqual(h.notes, [[60, 'tap', true]]);
  h.send('touchstart', { touches: [touch(40, 30)] });
  assert.equal(h.send('touchmove', { touches: [touch(42, 100)] }).defaultPrevented, false);
  h.send('touchend', { touches: [] });
  h.send('touchstart', { touches: [touch(40, 30), touch(60, 30, 2)] }); h.send('touchend', { touches: [] });
  assert.equal(h.notes.length, 1); h.signal.abort();
});

test('the knob owns horizontal drags while vertical knob swipes remain native', () => {
  const h = inputHarness();
  h.send('touchstart', { touches: [touch(150, 30)] });
  assert.equal(h.send('touchmove', { touches: [touch(190, 31)] }).defaultPrevented, true);
  assert.equal(h.cutoff, .75); h.send('touchend', { touches: [] });
  h.send('touchstart', { touches: [touch(150, 30)] });
  assert.equal(h.send('touchmove', { touches: [touch(152, 130)] }).defaultPrevented, false);
  assert.equal(h.notes.length, 0); h.signal.abort();
});

test('desktop presses release on cancellation and inactive scenes cannot make sound', () => {
  const h = inputHarness(); h.send('pointerdown', pointer(40, 30, 'mouse'));
  assert.equal(h.notes.length, 1); h.send('pointerleave', {});
  assert.deepEqual(h.releases, ['surface']);
  h.disable(); h.send('pointerdown', pointer(40, 30, 'mouse'));
  assert.equal(h.notes.length, 1); h.signal.abort();
});

function audioHarness(deferred = false) {
  let created = 0, resume;
  const node = () => {
    const n = { connect() { return n; }, start() {} };
    for (const name of ['gain', 'Q', 'frequency', 'detune', 'threshold', 'knee', 'ratio', 'delayTime']) n[name] = { value: 0, cancelScheduledValues() {}, setTargetAtTime(v) { this.value = v; } };
    n.getByteTimeDomainData = a => a.fill(128); return n;
  };
  const gains = [], oscillators = [];
  const context = {
    state: 'suspended', currentTime: 0, destination: node(),
    createGain() { const n = node(); gains.push(n); return n; },
    createOscillator() { const n = node(); oscillators.push(n); return n; },
    createBiquadFilter: node, createDynamicsCompressor: node, createAnalyser: node, createDelay: node,
    resume() { if (deferred) return new Promise(resolve => resume = () => { context.state = 'running'; resolve(); }); context.state = 'running'; return Promise.resolve(); },
    suspend() { context.state = 'suspended'; return Promise.resolve(); },
    close() { context.state = 'closed'; return Promise.resolve(); },
  };
  const synth = createSynth({ contextFactory() { created++; return context; } });
  return { synth, context, gains, oscillators, get created() { return created; }, resume() { resume(); } };
}

test('audio is lazy, uses last-note priority, and releases back to a held note', async () => {
  const h = audioHarness(); assert.equal(h.created, 0);
  h.synth.setCutoff(.9); assert.equal(h.created, 0);
  h.synth.noteOn(60, 'a'); await Promise.resolve();
  assert.equal(h.created, 1); assert.equal(h.synth.note, 60);
  h.synth.noteOn(67, 'g'); await Promise.resolve();
  assert.equal(h.synth.note, 67);
  assert.ok(Math.abs(h.oscillators[0].frequency.value - noteFrequency(67)) < .001);
  h.synth.noteOff('g'); assert.equal(h.synth.note, 60);
  h.synth.silence(); assert.equal(h.synth.note, null); assert.equal(h.gains[0].gain.value, 0);
  h.synth.dispose(); assert.equal(h.context.state, 'closed');
});

test('an audio unlock resolving after release cannot start a stuck note', async () => {
  const h = audioHarness(true);
  h.synth.noteOn(60, 'a'); h.synth.noteOff('a'); h.resume(); await Promise.resolve();
  assert.equal(h.synth.note, null); assert.equal(h.gains[0].gain.value, 0);
  h.synth.dispose(); h.synth.noteOn(60, 'a'); assert.equal(h.synth.note, null);
});

test('the 37 physical keys map to consecutive chromatic notes and the filter is bounded', () => {
  const keys = makeMoogData().keys.sort((a, b) => b.x - a.x);
  assert.deepEqual(keys.map(k => k.midi), Array.from({ length: 37 }, (_, i) => 48 + i));
  assert.equal(noteFrequency(69), 440);
  assert.equal(filterFrequency(-1), 140); assert.equal(filterFrequency(2), 6000);
});
