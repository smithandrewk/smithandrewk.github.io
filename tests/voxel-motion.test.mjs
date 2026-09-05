import test from "node:test";
import assert from "node:assert/strict";
import { figureData } from "../src/scripts/voxel/figure-data.js";
import {
  makePieces,
  piecePose,
  scrollProgress,
} from "../src/scripts/voxel/motion.js";

const pieces = makePieces(figureData);

test("every voxel belongs to exactly one falling piece", () => {
  const indices = pieces
    .flatMap((piece) => piece.indices)
    .sort((a, b) => a - b);
  assert.deepEqual(
    indices,
    Array.from({ length: figureData.voxels.length }, (_, i) => i),
  );
  assert.equal(figureData.transforms.length, figureData.voxels.length);
});

test("the approved model has finite positions and valid orientations", () => {
  for (const voxel of figureData.voxels) {
    assert.ok(voxel.slice(0, 3).every(Number.isFinite));
    assert.match(voxel[3], /^#[0-9a-f]{6}$/i);
  }
  for (const transform of figureData.transforms) {
    assert.ok(transform.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...transform.slice(0, 4)) - 1) < 0.001);
    assert.ok(transform.slice(4).every((scale) => scale > 0));
  }
});

test("the shoes are anchored while upper pieces launch from high above", () => {
  for (const piece of pieces) {
    const lowest = Math.min(
      ...piece.indices.map((i) => figureData.voxels[i][1]),
    );
    const pose = piecePose(piece, 0);
    if (lowest < 3) assert.equal(pose.settled, true);
    if (lowest >= 7) assert.ok(pose.drop >= 30);
  }
});

test("all pieces return exactly to their sculpted rest poses", () => {
  for (const piece of pieces) {
    assert.deepEqual(piecePose(piece, 1), {
      drop: 0,
      slide: 0,
      rotation: 0,
      settled: true,
    });
  }
});

test("scrubbing forward and backward is deterministic and bounded", () => {
  for (const piece of pieces) {
    const before = piecePose(piece, 0.35);
    for (const progress of [0, 0.1, 0.5, 0.9, 1, 0.5]) {
      const pose = piecePose(piece, progress);
      assert.ok([pose.drop, pose.slide, pose.rotation].every(Number.isFinite));
      assert.ok(pose.drop <= piece.lift + 0.42);
      assert.ok(pose.drop >= -0.42);
    }
    assert.deepEqual(piecePose(piece, 0.35), before);
  }
});

test("scroll progress is scoped to the portrait section and clamps outside it", () => {
  assert.equal(scrollProgress(0, 700, 1200, 600), 0);
  assert.equal(scrollProgress(700, 700, 1200, 600), 0);
  assert.equal(scrollProgress(1000, 700, 1200, 600), 0.5);
  assert.equal(scrollProgress(1300, 700, 1200, 600), 1);
  assert.equal(scrollProgress(2000, 700, 1200, 600), 1);
  assert.equal(scrollProgress(700, 700, 600, 600), 0);
  assert.equal(scrollProgress(701, 700, 600, 600), 1);
});
