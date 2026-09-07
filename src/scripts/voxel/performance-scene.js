import * as THREE from "three";
import { makePerformanceRig, playingGesture, smooth } from "./performance-motion.js";
import { makeMoogData } from "./moog-data.js";
import { clamp, randomFor } from "./motion.js";

export function createPerformanceScene(scene, geometry, material, figureData, instrumentGeometry = geometry) {
  const rig = makePerformanceRig(figureData), instrument = makeMoogData();
  const handMesh = new THREE.InstancedMesh(geometry, material, rig.rightHand.length);
  const instrumentMesh = new THREE.InstancedMesh(instrumentGeometry, material, instrument.blocks.length);
  for (const mesh of [handMesh, instrumentMesh]) {
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
  }
  handMesh.position.y = -.45;
  const color = new THREE.Color(), dummy = new THREE.Object3D();
  rig.rightHand.forEach((block, i) => handMesh.setColorAt(i, color.set(block.color)));
  instrument.blocks.forEach((block, i) => instrumentMesh.setColorAt(i, color.set(block.color)));
  const zAxis = new THREE.Vector3(0, 0, 1), xAxis = new THREE.Vector3(1, 0, 0);
  const lifeRotation = new THREE.Quaternion();
  const pocket = new THREE.Vector3(-5, 27, 1.9), neckPivot = new THREE.Vector3();
  let leftGesture = playingGesture(0), rightGesture = playingGesture(0);
  let lastInstrumentProgress = -1, lastPhrase = -1;
  let interactive = null;
  const scope = new THREE.InstancedMesh(instrumentGeometry, new THREE.MeshBasicMaterial({ color: '#c39c66' }), 40);
  scope.frustumCulled = false; scope.visible = false; scene.add(scope);
  const controlAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().fromArray(instrument.blocks.find(b => b.control)?.rotation));
  const controlPivot = new THREE.Vector3(...instrument.cutoff), controlTurn = new THREE.Quaternion();
  const hitPoint = new THREE.Vector3(), raycaster = new THREE.Raycaster();
  const hitBoxes = instrument.keys.map(key => new THREE.Box3(
    new THREE.Vector3(key.x - (key.black ? .26 : .41), key.black ? 24.22 : 23.82, key.black ? 6.64 : 3.85),
    new THREE.Vector3(key.x + (key.black ? .26 : .41), key.black ? 24.9 : 24.28, 8.87),
  ));
  const knobBox = new THREE.Box3().setFromCenterAndSize(controlPivot, new THREE.Vector3(1.7, 1.4, 1.7));
  const lean = new THREE.Quaternion(), hipPivot = new THREE.Vector3(0, 19.3, -6);

  function pick(camera, x, y) {
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    let distance = Infinity, result = null;
    for (let i = 0; i < hitBoxes.length; i++) {
      if (raycaster.ray.intersectBox(hitBoxes[i], hitPoint)) {
        const d = hitPoint.distanceTo(raycaster.ray.origin);
        if (d < distance) { distance = d; result = { midi: instrument.keys[i].midi }; }
      }
    }
    if (raycaster.ray.intersectBox(knobBox, hitPoint) && hitPoint.distanceTo(raycaster.ray.origin) < distance) result = { control: 'cutoff' };
    return result;
  }

  function update(progress, state, standAge, playAge, reduced, interaction = null) {
    interactive = interaction;
    lean.setFromAxisAngle(xAxis, -.21 * (interactive?.focus ?? 0));
    leftGesture = playingGesture(interactive?.focus > .01 ? 6.4 : playAge, 1); rightGesture = playingGesture(interactive?.focus > .01 ? 6.4 : playAge, -1);
    handMesh.visible = state.reach > .03;
    instrumentMesh.visible = progress > .45 && !reduced;
    if (handMesh.visible) {
      const reveal = smooth(.05, .3, state.reach);
      rig.rightHand.forEach((block, i) => {
        dummy.position.copy(block.position);
        // The hand emerges from the existing pocket before moving to the keys.
        dummy.position.lerp(pocket, 1 - state.reach);
        dummy.position.y += Math.sin(state.reach * Math.PI) * 3 + rightGesture.lift * state.playing;
        if (interactive) {
          dummy.position.x += interactive.rightX;
          dummy.position.y -= interactive.rightPress * .27;
        }
        dummy.quaternion.copy(block.rotation);
        dummy.scale.fromArray(block.scale).multiplyScalar(reveal);
        dummy.updateMatrix(); handMesh.setMatrixAt(i, dummy.matrix);
      });
      handMesh.instanceMatrix.needsUpdate = true;
    }
    if (instrumentMesh.visible && (progress !== lastInstrumentProgress || playAge !== lastPhrase || interactive?.moving || interactive?.focus > 0)) {
      instrument.blocks.forEach((block, i) => {
        // Once assembled, a phrase only needs to update the two played keys.
        if (progress === lastInstrumentProgress && block.key < 0 && !block.control) return;
        const r = randomFor(i + 7000);
        let start = .55 + block.p[1] / 29 * .06 + r * .035, duration = .16;
        if (block.part === "bench") { start = .445 + block.p[1] / 17 * .025 + r * .018; duration = .105; }
        if (block.part === "stand") { start = .475 + block.p[1] / 24 * .05 + r * .02; duration = .13; }
        if (block.part === "cable") { start = .69 + r * .04; duration = .12; }
        const t = clamp((progress - start) / duration);
        const fall = 1 - smooth(0, .9, t);
        dummy.position.fromArray(block.p);
        dummy.position.y += fall * (35 + r * 12);
        dummy.position.x += fall * (r - .5) * 4;
        if (t > .9 && t < 1) dummy.position.y += Math.sin((t - .9) / .1 * Math.PI) * .14;
        dummy.quaternion.fromArray(block.rotation);
        dummy.rotateZ((r - .5) * fall * .18);
        if (block.key >= 0 && interactive?.focus > .01) {
          dummy.position.y -= (interactive.depths[block.key] || 0) * .32;
        } else if (block.key >= 0 && state.playing > 0) {
          const x = instrument.keys[block.key].x;
          const hand = x > 0 ? leftGesture : rightGesture;
          // One note per hand keeps the phrase within the instrument's two-note voice allocation.
          const nearHand = block.key === (x > 0 ? 5 : 16);
          if (nearHand) dummy.position.y -= Math.max(0, -hand.lift + .12 * hand.envelope) * state.playing;
        }
        if (block.control) {
          controlTurn.setFromAxisAngle(controlAxis, ((interactive?.cutoff ?? .52) - .5) * -4.4);
          dummy.position.sub(controlPivot).applyQuaternion(controlTurn).add(controlPivot);
          dummy.quaternion.premultiply(controlTurn);
          color.set(block.color);
          if (block.scale[1] < .1) color.lerp(new THREE.Color('#e9b66c'), interactive?.focus ?? 0);
          instrumentMesh.setColorAt(i, color);
        }
        dummy.scale.fromArray(block.scale).multiplyScalar(t > 0 ? 1 : 0);
        dummy.updateMatrix(); instrumentMesh.setMatrixAt(i, dummy.matrix);
      });
      instrumentMesh.instanceMatrix.needsUpdate = true;
      instrumentMesh.instanceColor.needsUpdate = true;
      lastInstrumentProgress = progress; lastPhrase = playAge;
    }
    scope.visible = !reduced && (interactive?.focus ?? 0) > .95;
    if (scope.visible) {
      const wave = interactive.wave;
      let start = 0;
      if (wave) for (let i = 1; i < 400; i++) if (wave[i - 1] < 128 && wave[i] >= 128) { start = i; break; }
      for (let i = 0; i < 40; i++) {
        const value = wave ? (wave[(start + i * 8) % wave.length] - 128) / 128 : 0;
        dummy.position.set(5.8 - i * .3, 30 + value * 9, 16.8);
        dummy.quaternion.identity(); dummy.scale.set(.22, .22, .22);
        dummy.updateMatrix(); scope.setMatrixAt(i, dummy.matrix);
      }
      scope.instanceMatrix.needsUpdate = true;
    }
  }

  function poseVoxel(i, object, state, standAge, playAge, reduced) {
    const pose = rig.poses[i];
    const amount = /Arm|Hand/.test(pose.group) ? state.reach : state.sit;
    if (amount > 0) {
      object.position.lerp(pose.position, amount);
      object.quaternion.slerp(pose.rotation, amount);
      if (/Arm|Hand/.test(pose.group)) object.position.y += Math.sin(amount * Math.PI) * 1.8;
    }
    if (reduced) return;
    if (interactive?.focus > 0) {
      if (pose.group === 'head' || pose.group === 'body') {
        object.position.sub(hipPivot).applyQuaternion(lean).add(hipPivot);
        object.quaternion.premultiply(lean);
      } else if (pose.group.endsWith('Arm')) {
        object.position.z -= 2.7 * interactive.focus * smooth(29, 40, pose.rest.y);
      }
    }
    const settle = smooth(0, 1.6, standAge) * (1 - state.sit);
    const height = smooth(3, 48, pose.rest.y);
    object.position.x += .48 * settle * height;
    object.position.y -= .14 * settle * height;
    lifeRotation.setFromAxisAngle(zAxis, -.012 * settle * height);
    object.quaternion.premultiply(lifeRotation);
    const breath = Math.sin(clamp(standAge / 3.6) * Math.PI) * (1 - state.sit);
    if (pose.group === "body" || pose.group === "head") object.position.y += breath * .13 * height;
    if (pose.group === "head") {
      const angle = breath * .02 + leftGesture.sway * .15 * state.playing;
      lifeRotation.setFromAxisAngle(xAxis, angle);
      neckPivot.set(0, 49 - state.sit * 10, -state.sit * 4.3);
      object.position.sub(neckPivot).applyQuaternion(lifeRotation).add(neckPivot);
      object.quaternion.premultiply(lifeRotation);
    }
    if (pose.group === "leftHand") object.position.y += leftGesture.lift * state.playing;
    if (interactive && /Arm|Hand/.test(pose.group)) {
      const left = pose.group.startsWith('left');
      const weight = pose.group.endsWith('Hand') ? 1 : 1 - smooth(29, 36, pose.rest.y);
      object.position.x += (left ? interactive.leftX : interactive.rightX) * weight;
      object.position.y -= (left ? interactive.leftPress : interactive.rightPress) * .27 * weight;
    }
    if (pose.group === "leftArm" || pose.group === "rightArm") {
      const wristWeight = 1 - smooth(29, 36, pose.rest.y);
      object.position.y += (pose.group === "leftArm" ? leftGesture.lift : rightGesture.lift) * state.playing * wristWeight;
    }
  }
  return { update, poseVoxel, pick, keyData: instrument.keys, blockCount: instrument.blocks.length, keys: instrument.keys.length };
}
