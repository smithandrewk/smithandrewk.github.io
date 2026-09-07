import test from 'node:test';
import assert from 'node:assert/strict';
import { bindInstrumentInput } from '../src/scripts/voxel/instrument-input.js';
import { createSynth, noteFrequency, filterFrequency, AUDIO_TAIL_SECONDS } from '../src/scripts/voxel/synth.js';
import { makeMoogData } from '../src/scripts/voxel/moog-data.js';
import { createPlaybackSession } from '../src/scripts/voxel/playback-session.js';
import { portraitChapters, createPlayDiscovery } from '../src/scripts/voxel/play-discovery.js';

function inputHarness(touchCapable = true) {
  const stage = new EventTarget(), signal = new AbortController(), capture = new Set();
  stage.ownerDocument = { defaultView: new EventTarget() };
  if (touchCapable) stage.ownerDocument.defaultView.ontouchstart = null;
  stage.setPointerCapture = id => capture.add(id);
  stage.hasPointerCapture = id => capture.has(id);
  stage.releasePointerCapture = id => capture.delete(id);
  const notes = [], releases = []; let cutoff = .5, enabled = true;
  bindInstrumentInput(stage, {
    enabled: () => enabled,
    pick: x => x >= 0 && x < 100 ? { midi: 48 + Math.floor(x / 5) } : x >= 150 && x < 180 ? { control: 'cutoff' } : null,
    slide: x => ({ midi: 48 + Math.max(0, Math.min(19, Math.floor(x / 5))) }),
    press: (...note) => notes.push(note), release: id => releases.push(id), getCutoff: () => cutoff, setCutoff: v => cutoff = v, signal: signal.signal,
  });
  return { notes, releases, signal, stage, capture, get cutoff() { return cutoff; }, disable() { enabled = false; }, send(type, props) { const e = Object.assign(new Event(type, { cancelable: true }), props); stage.dispatchEvent(e); return e; } };
}
const touch = (x, y, identifier = 1) => ({ clientX: x, clientY: y, identifier });
const pointer = (x, y, pointerType = 'touch') => ({ clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType, button: 0 });

test('an iPhone touch sounds on contact and slides down without duplicate pointer notes', () => {
  const h = inputHarness();
  h.send('pointerdown', pointer(90, 100));
  assert.equal(h.notes.length, 0);
  assert.equal(h.send('touchstart', { touches: [touch(90, 100)] }).defaultPrevented, true);
  assert.deepEqual(h.notes, [[66, 'surface']]);
  h.send('pointercancel', pointer(90, 100));
  assert.equal(h.send('touchmove', { touches: [touch(10, 100)] }).defaultPrevented, true);
  assert.deepEqual(h.notes, [[66, 'surface'], [50, 'surface']]);
  assert.equal(h.releases.length, 0);
  h.send('touchend', { touches: [] }); assert.deepEqual(h.releases, ['surface']); h.signal.abort();
});

test('vertical movement changes tone while preserving the held note', () => {
  const h = inputHarness(); h.send('touchstart', { touches: [touch(90, 100)] });
  h.send('touchmove', { touches: [touch(91, 10)] }); assert.equal(h.cutoff, 1);
  h.send('touchmove', { touches: [touch(91, 190)] }); assert.equal(h.cutoff, 0);
  assert.equal(h.notes.length, 1); assert.equal(h.releases.length, 0); h.signal.abort();
  assert.equal(h.releases.length, 1);
});

test('background swipes remain native even if the finger later passes across keys', () => {
  const h = inputHarness();
  assert.equal(h.send('touchstart', { touches: [touch(110, 30)] }).defaultPrevented, false);
  assert.equal(h.send('touchmove', { touches: [touch(90, 130)] }).defaultPrevented, false);
  h.send('touchend', { touches: [] }); assert.equal(h.notes.length, 0); h.signal.abort();
});

test('a second finger or touch cancellation releases the voice', () => {
  const h = inputHarness(); h.send('touchstart', { touches: [touch(40, 30)] });
  h.send('touchstart', { touches: [touch(40, 30), touch(60, 30, 2)] });
  assert.equal(h.releases.length, 1);
  h.send('touchmove', { touches: [touch(30, 20), touch(70, 40, 2)] });
  assert.equal(h.notes.length, 1);
  h.send('touchstart', { touches: [touch(40, 30)] }); h.send('touchcancel', {});
  assert.equal(h.releases.length, 2); h.signal.abort();
});

test('the knob supports both axes without playing a note', () => {
  const h = inputHarness(); h.send('touchstart', { touches: [touch(150, 30)] });
  assert.equal(h.send('touchmove', { touches: [touch(190, 30)] }).defaultPrevented, true);
  assert.equal(h.cutoff, .75); h.send('touchend', { touches: [] });
  assert.equal(h.notes.length, 0); h.signal.abort();
});

test('pointer-only touch and mouse input capture a sustained gesture and release on cancellation', () => {
  for (const kind of ['touch', 'mouse']) {
    const h = inputHarness(false); h.send('pointerdown', pointer(40, 30, kind));
    assert.equal(h.notes.length, 1); assert.equal(h.capture.has(1), true);
    h.send('pointermove', pointer(-20, 80, kind)); assert.equal(h.notes.at(-1)[0], 48);
    h.send('pointercancel', pointer(-20, 80, kind)); assert.deepEqual(h.releases, ['surface']);
    assert.equal(h.capture.size, 0); h.disable(); h.send('pointerdown', pointer(40, 30, kind));
    assert.equal(h.notes.length, 2); h.signal.abort();
  }
});

function audioHarness(deferred = false, playbackSession) {
  let created = 0, resume;
  const node = () => {
    const n = { connect() { return n; }, start() {} };
    for (const name of ['gain', 'Q', 'frequency', 'detune', 'threshold', 'knee', 'ratio', 'delayTime']) n[name] = { value: 0, cancelScheduledValues() {}, setTargetAtTime(v) { this.value = v; } };
    n.getByteTimeDomainData = a => a.fill(128); return n;
  };
  const gains = [], oscillators = [];
  const context = {
    state: 'suspended', currentTime: 0, sampleRate: 44100, destination: node(),
    createBuffer(channels, length) { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { getChannelData: channel => data[channel] }; },
    createGain() { const n = node(); gains.push(n); return n; },
    createOscillator() { const n = node(); oscillators.push(n); return n; },
    createBiquadFilter: node, createDynamicsCompressor: node, createAnalyser: node, createConvolver: node,
    resume() { if (deferred) return new Promise(resolve => resume = () => { context.state = 'running'; resolve(); }); context.state = 'running'; return Promise.resolve(); },
    suspend() { context.state = 'suspended'; return Promise.resolve(); },
    close() { context.state = 'closed'; return Promise.resolve(); },
  };
  const synth = createSynth({ contextFactory() { created++; return context; }, playbackSession });
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

test('music playback is claimed on the first note, then the prior session is restored', async () => {
  const audioSession = { type: 'auto' }, session = createPlaybackSession({ audioSession });
  const h = audioHarness(false, session);
  h.synth.setCutoff(.8); assert.equal(audioSession.type, 'auto'); assert.equal(h.created, 0);
  h.synth.noteOn(60, 'finger'); await Promise.resolve(); assert.equal(audioSession.type, 'playback');
  h.synth.noteOn(55, 'finger'); await Promise.resolve(); assert.equal(h.synth.note, 55);
  assert.equal(h.gains[0].gain.value, .24);
  h.synth.noteOff('finger');
  await new Promise(resolve => setTimeout(resolve, 1150));
  assert.equal(audioSession.type, 'playback'); assert.equal(h.context.state, 'running');
  await new Promise(resolve => setTimeout(resolve, AUDIO_TAIL_SECONDS * 1000 - 1100));
  assert.equal(audioSession.type, 'auto'); assert.equal(h.context.state, 'suspended');
  h.synth.dispose();
});

test('unsupported audio sessions and hosts that reject the setting remain usable', () => {
  for (const environment of [undefined, {}, { get audioSession() { throw new Error('unsupported'); } }, { audioSession: Object.freeze({ type: 'auto' }) }]) {
    const session = createPlaybackSession(environment);
    assert.doesNotThrow(() => { session.acquire(); session.release(); });
  }
  const audioSession = { type: 'ambient' }, session = createPlaybackSession({ audioSession });
  session.acquire(); session.acquire(); session.release(); assert.equal(audioSession.type, 'ambient');
  session.acquire(); audioSession.type = 'play-and-record'; session.release(); assert.equal(audioSession.type, 'play-and-record');
});

test('a new touch arriving during idle suspension resumes without losing playback mode', async () => {
  const audioSession = { type: 'auto' }, h = audioHarness(false, createPlaybackSession({ audioSession }));
  let finishSuspending;
  h.context.suspend = () => new Promise(resolve => {
    finishSuspending = () => { h.context.state = 'suspended'; resolve(); };
  });
  try {
    h.synth.noteOn(60, 'finger'); await Promise.resolve(); h.synth.noteOff('finger');
    await new Promise(resolve => setTimeout(resolve, AUDIO_TAIL_SECONDS * 1000 + 50));
    assert.equal(typeof finishSuspending, 'function');
    h.synth.noteOn(67, 'finger'); finishSuspending(); await Promise.resolve();
    assert.equal(h.context.state, 'running'); assert.equal(h.synth.note, 67);
    assert.equal(audioSession.type, 'playback'); assert.equal(h.gains[0].gain.value, .24);
  } finally { h.synth.dispose(); }
});

test('the new final chapter reveals a playable view before the sticky section ends', () => {
  assert.equal(portraitChapters(.65).story, 1);
  assert.equal(portraitChapters(.68).reveal, 0);
  assert.equal(portraitChapters(.82).reveal, 1);
  assert.equal(portraitChapters(1).reveal, 1);
  assert.deepEqual(portraitChapters(1, true), { story: 1, reveal: 0 });
  // The assembly/performance segment still gets roughly the same scroll distance.
  assert.ok(Math.abs((4.4 - 1) * .65 - (3.2 - 1)) < .02);
});

test('automatic discovery reverses, respects Done, and resets on the next visit', () => {
  const d = createPlayDiscovery();
  assert.deepEqual(d.update(true, 0), { open: false, focus: 0 });
  assert.deepEqual(d.update(true, .6), { open: true, focus: .6 });
  assert.deepEqual(d.update(true, 1), { open: true, focus: 1 });
  d.dismiss(); assert.deepEqual(d.update(true, 1), { open: false, focus: 0 });
  assert.equal(d.update(true, .5).open, false);
  d.update(true, 0); assert.equal(d.update(true, 1).open, true);
  d.update(true, 0); assert.equal(d.update(true, 0).open, false);
  d.enter(); assert.equal(d.update(true, 0).focus, 1);
  d.scroll(); assert.equal(d.update(true, 0).open, false);
  d.enter(); assert.equal(d.update(false, 1).open, false);
});
