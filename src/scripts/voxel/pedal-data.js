// A compact, blueSky-inspired enclosure with original two-knob controls.
// All surfaces, lettering, indicator lines and cables are solid geometry.
// Reference: https://www.strymon.net/product/bluesky/
export function makePedalData() {
  const blocks = [], controls = { mix: [-16.15, 25.8, 12], space: [-13.85, 25.8, 12], bypass: [-15, 25.35, 8.2] };
  const put = (p, scale, color, control) => blocks.push({ p, scale, color, control, rotation: [0, 0, 0, 1], key: -1, part: 'pedal' });
  const blue = '#478fae', cream = '#f4ead5', dark = '#1e3039';
  for (let x = 0; x < 8; x++) for (let z = 0; z < 10; z++) {
    put([-17.3 + x * .66, 24.35, 7 + z * .67], [.68, .85, .69], blue);
    put([-17.3 + x * .66, 23.88, 7 + z * .67], [.68, .16, .69], '#234b60');
  }
  for (const name of ['mix', 'space']) {
    const [x, y, z] = controls[name];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      put([x + a * .37, y, z + b * .37], [.38, .65, .38], cream, name);
    }
    put([x, y + .35, z + .4], [.13, .05, .47], dark, name);
    for (let i = 0; i < 7; i++) {
      const angle = -2.2 + i / 6 * 4.4;
      put([x + Math.sin(angle) * .85, 24.82, z + Math.cos(angle) * .85], [.12, .045, .12], cream);
    }
  }
  const glyphs = {
    B:['110','101','110','101','110'], L:['100','100','100','100','111'], U:['101','101','101','101','111'], E:['111','100','110','100','111'],
    R:['110','101','110','101','101'], O:['111','101','101','101','111'], M:['101','111','111','101','101'],
  };
  for (const [word, z] of [['BLUE', 10.65], ['ROOM', 9.55]]) {
    [...word].forEach((letter, n) => glyphs[letter].forEach((row, r) => [...row].forEach((bit, c) => {
      if (bit === '1') put([-13.7 - (n * 4 + c) * .18, 24.8, z - r * .15], [.145, .04, .12], cream);
    })));
  }
  put(controls.bypass, [.7, .62, .7], '#bdc7c6', 'bypass');
  put([-15, 25.7, 8.2], [.82, .12, .82], '#ecede4', 'bypass');
  put([-15, 24.88, 9.05], [.25, .13, .25], '#9de8db', 'led');
  // A slim, supported tray beside the instrument, with two patch leads.
  for (let x = -17.6; x < -11.2; x += .7) for (let z = 6.5; z < 13.9; z += .7) put([x, 23.45, z], [.73, .22, .73], dark);
  for (let y = 1; y < 23.3; y += .8) put([-14.8, y, 12.8], [.45, .83, .45], '#283536');
  for (let x = -17; x < -12; x += .7) put([x, .5, 12.8], [.72, .45, 1.2], dark);
  for (const z of [12.7, 13.5]) for (let x = -12.6; x < -10.5; x += .24) put([x, 25, z], [.25, .18, .18], dark);
  return { blocks, controls };
}
