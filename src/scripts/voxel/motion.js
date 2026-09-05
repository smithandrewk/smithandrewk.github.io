export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export function randomFor(index) {
  const n = Math.sin(index * 127.1 + 41.7) * 43758.5453;
  return n - Math.floor(n);
}
export function makePieces(data) {
  const height = Math.max(...data.voxels.map((v) => v[1]));
  return data.pieces.map((indices, id) => {
    const center = [0, 0, 0];
    let low = Infinity;
    indices.forEach((i) => {
      const v = data.voxels[i];
      for (let a = 0; a < 3; a++) center[a] += v[a] / indices.length;
      low = Math.min(low, v[1]);
    });
    const r = randomFor(id);
    return {
      indices,
      center,
      start:
        low < 3
          ? -0.2
          : low < 7
            ? -0.075
            : Math.max(0, (low - 7) / (height - 7)) * 0.61 + r * 0.02,
      duration: 0.18,
      drift: (r - 0.5) * 2.5,
      turn: (r - 0.5) * 0.3,
      lift: 30 + (1 - low / height) * 8 + r * 6,
    };
  });
}
export function piecePose(piece, progress) {
  const q = clamp((progress - piece.start) / piece.duration);
  if (q === 1) return { drop: 0, slide: 0, rotation: 0, settled: true };
  const fall = clamp(q / 0.83);
  const remaining = 1 - fall * fall;
  const settle = clamp((q - 0.83) / 0.17);
  const bounce =
    q > 0.83
      ? Math.sin(settle * Math.PI * 2) * Math.pow(1 - settle, 2) * 0.42
      : 0;
  return {
    drop: remaining * piece.lift + bounce,
    slide: remaining * piece.drift,
    rotation: piece.turn * (1 - fall),
    settled: q === 1,
  };
}
export function scrollProgress(scrollY, top, height, viewport) {
  return clamp((scrollY - top) / Math.max(1, height - viewport));
}
