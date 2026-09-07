import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { figureData } from "../src/scripts/voxel/figure-data.js";
import { figureParts } from "../src/scripts/voxel/figure-parts.js";
import { makeMoogData } from "../src/scripts/voxel/moog-data.js";
import { performanceTimeline, makePerformanceRig, playingGesture } from "../src/scripts/voxel/performance-motion.js";
import { createPerformanceScene } from "../src/scripts/voxel/performance-scene.js";

test("the second scene starts after assembly and seats Andrew after the bench lands", () => {
  assert.equal(performanceTimeline(.36).assembly, 1);
  assert.equal(performanceTimeline(.44).sit, 0);
  assert.equal(performanceTimeline(.44).instrument, 0);
  assert.equal(performanceTimeline(.60).platform, 1);
  const seated = performanceTimeline(.82);
  assert.equal(seated.sit, 1);
  assert.equal(seated.bench, 1);
  assert.equal(seated.instrument, 1);
  assert.equal(seated.playing, 0);
  assert.equal(performanceTimeline(.96).playing, 1);
  for (let t = 0; t <= 1; t += .01) {
    assert.ok(Object.values(performanceTimeline(t)).every(v => v >= 0 && v <= 1));
  }
});

test("the Moog has the correct C-to-C key pattern and individual solid controls", () => {
  const { blocks, keys, knobCount } = makeMoogData();
  assert.equal(keys.length, 37);
  assert.equal(knobCount, 40);
  assert.equal(keys.filter(k => k.black).length, 15);
  const ordered = [...keys].sort((a, b) => b.x - a.x);
  assert.equal(ordered.map(k => k.black ? "b" : "w").join(""), "wbwbwwbwbwbw".repeat(3) + "w");
  assert.equal(blocks.filter(b => b.part === "switch").length, 74);
  for (const b of blocks) {
    assert.ok([...b.p, ...b.rotation, ...b.scale].every(Number.isFinite));
    assert.ok(b.scale.every(v => v > 0));
    assert.ok(Math.abs(Math.hypot(...b.rotation) - 1) < 1e-6);
  }
});

test("the seated rig keeps shoes planted and both hands over the keyboard", () => {
  const { poses, rightHand } = makePerformanceRig(figureData);
  assert.equal(figureParts.length, figureData.voxels.length);
  for (const p of poses) {
    assert.ok([...p.position, ...p.rotation].every(Number.isFinite));
    assert.ok(Math.abs(p.rotation.length() - 1) < .001);
    if (p.group === "feet") assert.equal(p.position.y, p.rest.y);
  }
  for (const hand of [poses.filter(p => p.group === "leftHand"), rightHand]) {
    const fingertips = hand.filter(p => p.part === "fingers");
    assert.ok(fingertips.every(p => Math.abs(p.position.x) < 7 && p.position.z > 4 && p.position.z < 9));
    // Hands belong above the keybed, not floating at chest height or inside the casing.
    assert.ok(fingertips.every(p => p.position.y > 24 && p.position.y < 26.8));
  }
});

test("reversing to the portrait restores every approved block transform exactly", () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const performance = createPerformanceScene(scene, geometry, material, figureData);
  const object = new THREE.Object3D();
  for (let i = 0; i < figureData.voxels.length; i++) {
    const v = figureData.voxels[i], t = figureData.transforms[i];
    object.position.fromArray(v); object.quaternion.fromArray(t); object.scale.fromArray(t, 4);
    performance.poseVoxel(i, object, performanceTimeline(0), 0, 0, false);
    assert.deepEqual(object.position.toArray(), v.slice(0, 3));
    assert.deepEqual(object.quaternion.toArray(), t.slice(0, 4));
    assert.deepEqual(object.scale.toArray(), t.slice(4));
  }
  geometry.dispose(); material.dispose();
});

test("reduced motion shows the original statue and idle gestures come to rest", () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const performance = createPerformanceScene(scene, geometry, material, figureData);
  for (const t of [0, .4, .75, 1]) {
    const state = performanceTimeline(t, true);
    performance.update(t, state, 0, 0, true);
    assert.equal(state.assembly, 1);
    assert.equal(state.sit, 0);
    assert.ok(scene.children.every(mesh => !mesh.visible));
  }
  assert.equal(playingGesture(0).envelope, 0);
  assert.ok(playingGesture(2).envelope > 0);
  assert.deepEqual(playingGesture(6.4), playingGesture(20));
  geometry.dispose(); material.dispose();
});

test('playing a key depresses only that note and release restores its geometry', () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const performance = createPerformanceScene(scene, geometry, material, figureData), data = makeMoogData();
  const mesh = scene.children.find(mesh => mesh.count === data.blocks.length);
  const index = data.keys.findIndex(key => key.midi === 60), block = data.blocks.findIndex(block => block.key === index);
  const interaction = { focus: 1, depths: new Float32Array(37), cutoff: .52, moving: true, leftX: 0, rightX: 0, leftPress: 0, rightPress: 0 };
  performance.update(1, performanceTimeline(1), 3.6, 6.4, false, interaction);
  const rest = new THREE.Matrix4(), pressed = new THREE.Matrix4(), released = new THREE.Matrix4(); mesh.getMatrixAt(block, rest);
  interaction.depths[index] = 1;
  performance.update(1, performanceTimeline(1), 3.6, 6.4, false, interaction); mesh.getMatrixAt(block, pressed);
  assert.ok(Math.abs(rest.elements[13] - pressed.elements[13] - .32) < .00001);
  interaction.depths[index] = 0;
  performance.update(1, performanceTimeline(1), 3.6, 6.4, false, interaction); mesh.getMatrixAt(block, released);
  assert.deepEqual(released.elements, rest.elements);
  geometry.dispose(); material.dispose();
});

test('the physical key hit regions resolve every chromatic note from the player camera', () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const performance = createPerformanceScene(scene, geometry, material, figureData);
  const camera = new THREE.OrthographicCamera(-15, 15, 15, -15, .1, 500), target = new THREE.Vector3(0, 24.5, 11.5);
  camera.position.set(target.x + Math.sin(-Math.PI + .12) * Math.cos(1.43) * 175, target.y + Math.sin(1.43) * 175, target.z + Math.cos(-Math.PI + .12) * Math.cos(1.43) * 175);
  camera.lookAt(target); camera.updateMatrixWorld();
  for (const key of performance.keyData) {
    const point = new THREE.Vector3(key.x, key.black ? 24.9 : 24.28, key.black ? 7.5 : 4.4).project(camera);
    assert.equal(performance.pick(camera, point.x, point.y)?.midi, key.midi);
  }
  geometry.dispose(); material.dispose();
});
