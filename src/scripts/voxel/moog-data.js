import { Quaternion, Vector3 } from "three";
import { makePedalData } from './pedal-data.js';

// Proportions and panel organization referenced against Moog's Subsequent 37:
// https://www.moogmusic.com/synthesizers/subsequent-37/
// 37 notes (22 white / 15 black), 40 knobs, left-hand wheels, a sloping black
// panel and curved wood cheeks. Every visible detail is solid geometry.
export function makeMoogData() {
  const blocks = [], keys = [];
  const identity = [0, 0, 0, 1];
  const put = (p, scale, color, part, rotation = identity, key = -1) => {
    blocks.push({ p, scale, color, part, rotation, key });
  };
  function tiled(center, size, color, part, pitch = .8) {
    const counts = size.map(v => Math.max(1, Math.ceil(v / pitch)));
    for (let x = 0; x < counts[0]; x++) for (let y = 0; y < counts[1]; y++) for (let z = 0; z < counts[2]; z++) {
      if (x && x < counts[0] - 1 && y && y < counts[1] - 1 && z && z < counts[2] - 1) continue;
      const c = [x, y, z];
      put(c.map((v, axis) => center[axis] - size[axis] / 2 + (v + .5) * size[axis] / counts[axis]), size.map((v, axis) => v / counts[axis] * 1.015), color, part);
    }
  }
  const dark = "#252a2c", black = "#111617", silver = "#a3a8a5", wood = ["#885332", "#98613d", "#a66c44"];
  const angle = Math.atan(.43);
  const panelRotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -angle).toArray();
  const panelY = z => 24.7 + (z - 8.65) * .43;
  tiled([0, 22.9, 10], [23.6, 1.25, 12.5], black, "chassis");
  // Rear steel wall and silver extrusion.
  tiled([0, 25.05, 16.05], [22.3, 5, .62], dark, "chassis");
  for (let x = -10.9; x <= 10.9; x += .75) put([x, 28, 16.02], [.77, .17, .23], silver, "panel");
  for (let side of [-1, 1]) {
    for (let z = 4; z <= 16; z += .7) {
      const top = z < 8.6 ? 24.1 : panelY(z) + .4;
      const n = Math.ceil((top - 22.25) / .67);
      for (let y = 0; y < n; y++) put([side * 11.65, 22.25 + (y + .5) * (top - 22.25) / n, z], [.7, (top - 22.25) / n * 1.02, .73], wood[(y + Math.round(z * 3)) % wood.length], "wood");
    }
  }
  // The keybed: C to C over three octaves. Bass is on the player's left (+X).
  for (let j = 0; j < 22; j++) {
    const x = 8.55 - j * .84;
    keys.push({ x, black: false, midi: 48 + Math.floor(j / 7) * 12 + [0, 2, 4, 5, 7, 9, 11][j % 7] });
    for (let row = 0; row < 6; row++) put([x, 24.05, 4.25 + row * .75], [.815, .43, .755], "#f1eee2", "key", identity, j);
  }
  for (let octave = 0; octave < 3; octave++) for (let gap of [0, 1, 3, 4, 5]) {
    const x = 8.55 - (octave * 7 + gap + .5) * .84;
    const id = keys.length; keys.push({ x, black: true, midi: 48 + octave * 12 + [1, 3, 0, 6, 8, 10][gap] });
    for (let row = 0; row < 3; row++) put([x, 24.55, 7.02 + row * .73], [.49, .65, .75], black, "key", identity, id);
  }
  // Two rubber performance wheels in the recessed left block.
  tiled([10.15, 23.65, 6.45], [2.05, .4, 5.1], dark, "wheels");
  for (const x of [9.65, 10.65]) {
    put([x, 24.1, 6.6], [.47, .6, 1.5], "#171c1d", "wheels");
    put([x, 24.43, 6.6], [.16, .08, .86], "#b78b53", "wheels");
  }
  for (let x = -10.65; x <= 10.7; x += .72) for (let z = 9.15; z <= 15.85; z += .67) put([x, panelY(z), z], [.74, .25, .75], dark, "panel", panelRotation);
  // Fine, pale dividers articulate the modulation / oscillator / mixer / filter /
  // envelope sections. Avoid raster panel textures, even for the lettering.
  for (const x of [7.25, 4.2, 1.2, -1.2, -4.4]) for (let z = 9.35; z < 15.75; z += .45) put([x, panelY(z) + .16, z], [.045, .04, .48], "#8b9087", "panel", panelRotation);
  const knobs = [];
  for (const x of [6.3, 4.95, 3.15, 1.9, .25, -2.55, -4.95, -6.55, -8.1, -9.65]) for (const z of [10.25, 11.9, 13.55, 15.1]) knobs.push([x, z]);
  knobs.forEach(([x, z], index) => {
    const large = index === 21;
    const size = large ? .85 : .52;
    put([x, panelY(z) + .38, z - .11], [size, .56, size], black, "knob", panelRotation);
    put([x, panelY(z) + .67, z - .23], [size * .8, .07, size * .8], silver, "knob", panelRotation);
    put([x, panelY(z) + .72, z - .36], [.08, .04, size * .38], "#ede7d4", "knob", panelRotation);
    if (large) for (const block of blocks.slice(-3)) block.control = "cutoff";
  });
  // LCD and menu buttons at the player's upper left.
  put([9.3, panelY(14.9) + .17, 14.9], [2.35, .18, 1.35], "#101819", "display", panelRotation);
  put([9.3, panelY(14.9) + .28, 14.86], [1.92, .06, .92], "#cadbd6", "display", panelRotation);
  for (let row = 0; row < 3; row++) put([9.35, panelY(15.12 - row * .24) + .34, 15.12 - row * .24], [1.36 - row * .25, .025, .065], "#405654", "display", panelRotation);
  for (let i = 0; i < 74; i++) {
    const col = i % 19, row = Math.floor(i / 19);
    const x = 10.5 - col * 1.12, z = 9.48 + row * 1.65;
    put([x, panelY(z) + .2, z], [.24, .14, .26], i % 7 === 0 ? "#ebad48" : "#555e5c", "switch", panelRotation);
  }
  // Small geometry-built Moog wordmark on the rear, readable when rotating.
  const glyphs = { M:["10001","11011","10101","10101","10001"], O:["01110","10001","10001","10001","01110"], G:["01110","10000","10111","10001","01110"] };
  let start = -2.8;
  for (const letter of "MOOG") {
    glyphs[letter].forEach((line, r) => [...line].forEach((bit, c) => {
      if (bit === "1") put([start + c * .24, 26.6 - r * .24, 16.42], [.2, .2, .075], "#e4e1d5", "wordmark");
    })); start += 1.5;
  }
  // A compact double-X gig stand and a padded bench, built from the same blocks.
  function beam(a, b, width, part) {
    const from = new Vector3(...a), to = new Vector3(...b), delta = to.clone().sub(from), length = delta.length();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()).toArray();
    const n = Math.ceil(length / .82);
    for (let i = 0; i < n; i++) put(from.clone().lerp(to, (i + .5) / n).toArray(), [width, length / n * 1.03, width], black, part, q);
  }
  for (const z of [8, 12.8]) {
    beam([-8.5, .5, z], [8.5, 22.25, z], .75, "stand");
    beam([8.5, .5, z], [-8.5, 22.25, z], .75, "stand");
    for (const x of [-8.5, 8.5]) tiled([x, .35, z], [2, .6, 2.8], "#313738", "stand");
  }
  for (const x of [-8.5, 8.5]) beam([x, 22.1, 4.5], [x, 22.1, 15.3], .8, "stand");
  tiled([0, 16.05, -6.6], [13.5, 1.6, 7.7], "#383d3c", "bench", .85);
  for (const z of [-8.8, -4.4]) {
    beam([-5.2, .45, z], [5.2, 15.25, z], .7, "bench");
    beam([5.2, .45, z], [-5.2, 15.25, z], .7, "bench");
  }
  // Instrument cable hangs from the rear jack to a quiet coil on the plinth.
  const path = [[-9.2, 25, 16.5], [-10.3, 23, 17.3], [-11, 16, 17.5], [-11.5, 8, 17], [-10.5, .4, 16]];
  for (let i = 1; i < path.length; i++) beam(path[i-1], path[i], .2, "cable");
  for (let i = 0; i < 35; i++) {
    const t = i / 34 * Math.PI * 2;
    put([-8.1 + Math.cos(t) * 2.3, .18, 15.5 + Math.sin(t) * 1.4], [.3, .2, .3], black, "cable");
  }
  const pedal = makePedalData(); blocks.push(...pedal.blocks);
  return { blocks, keys, knobCount: knobs.length, pedal: pedal.controls, cutoff: [-2.55, panelY(11.9) + .4, 11.79] };
}
