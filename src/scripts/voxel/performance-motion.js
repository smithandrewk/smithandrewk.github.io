import { Quaternion, Vector3 } from "three";
import { clamp } from "./motion.js";
import { figureParts } from "./figure-parts.js";

export const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// A quiet beat between assembly and the second scene gives the portrait time to land.
export function performanceTimeline(progress, reduced = false) {
  if (reduced) return { assembly: 1, settle: 0, platform: 0, bench: 0, instrument: 0, sit: 0, reach: 0, playing: 0, camera: 0 };
  return {
    assembly: clamp(progress / .36),
    settle: smooth(.35, .44, progress) * (1 - smooth(.49, .61, progress)),
    platform: smooth(.43, .59, progress),
    bench: smooth(.46, .62, progress),
    instrument: smooth(.53, .77, progress),
    sit: smooth(.54, .82, progress),
    reach: smooth(.58, .86, progress),
    playing: smooth(.86, .94, progress),
    camera: smooth(.47, .88, progress),
  };
}

const vec = (p) => new Vector3(...p);
const qx = (angle) => new Quaternion().setFromAxisAngle(vec([1, 0, 0]), angle);
const hip = vec([0, 29.3, 0]);
const seatedHip = vec([0, 19.3, -6]);
const torsoRotation = qx(.085);
const handParts = new Set(["left-hand", "fingers", "thumb"]);
const headParts = new Set(["face", "ear", "hair", "cap", "bill", "strap", "button"]);
const shoeParts = new Set(["outsole", "sole", "sneaker", "tiger-blue", "tiger-red", "laces"]);

function bodyPoint(p) { return p.clone().sub(hip).applyQuaternion(torsoRotation).add(seatedHip); }

// Bend each surface around a continuous spine. The cubes stay rigid, with their
// tangent frames following the bend instead of stretching into long rectangles.
function bend(p, source, target) {
  const curves = [source, target].map(nodes => nodes.map(vec));
  let section = 0;
  while (section < source.length - 2 && p.y > source[section + 1][1]) section++;
  const t = clamp((p.y - source[section][1]) / (source[section + 1][1] - source[section][1]));
  const src = curves[0][section].clone().lerp(curves[0][section + 1], t);
  const dst = curves[1][section].clone().lerp(curves[1][section + 1], t);
  const rotations = source.slice(1).map((_, j) => new Quaternion().setFromUnitVectors(
    curves[0][j + 1].clone().sub(curves[0][j]).normalize(),
    curves[1][j + 1].clone().sub(curves[1][j]).normalize(),
  ));
  const rotation = rotations[section].clone();
  const softness = .25;
  if (section > 0 && t < softness) rotation.slerp(rotations[section - 1], .5 * (1 - t / softness));
  if (section < rotations.length - 1 && t > 1 - softness) rotation.slerp(rotations[section + 1], .5 * (t - 1 + softness) / softness);
  return { position: p.clone().sub(src).applyQuaternion(rotation).add(dst), rotation };
}

function armTarget(p, side) {
  const right = side < 0;
  const wrist = right ? [-5.3, 27.6, 2.25] : [7.9, 29.1, .65];
  const elbow = right ? [-8.65, 34.1, .6] : [8.2, 34.1, .45];
  const shoulder = [side * 7.6, 40.2, .1];
  return bend(p, [wrist, elbow, shoulder], [
    [side * 4.8, 25.45, 3.8],
    [side * 8.1, 25.4, -2.4],
    bodyPoint(vec(shoulder)).toArray(),
  ]);
}

export function makePerformanceRig(data) {
  const poses = data.voxels.map((v, i) => {
    const p = vec(v.slice(0, 3)), part = figureParts[i], side = p.x < 0 ? -1 : 1;
    let position = bodyPoint(p), rotation = torsoRotation.clone(), group = "body";
    if (part.endsWith("jeans") || part.startsWith("pocket-")) {
      const left = side < 0;
      const src = left
        ? [[-5.4, 3.15, .15], [-4.8, 16, .35], [-3.25, 29.3, 0]]
        : [[4.6, 3.15, .05], [3.85, 16, .3], [3.15, 29.3, 0]];
      ({ position, rotation } = bend(p, src, [[side * 5, 3.15, 7.2], [side * 4.8, 17, 6.6], [src[2][0], 19.3, -6]]));
      group = "legs";
    } else if (shoeParts.has(part)) {
      position = p.clone().add(vec([.4, 0, 7.2]));
      rotation.identity(); group = "feet";
    } else if (part === "bare-arm") {
      ({ position, rotation } = armTarget(p, side)); group = side < 0 ? "rightArm" : "leftArm";
    } else if (part === "tee-sleeve") {
      const shoulder = vec([side * 7.6, 40.2, .1]);
      const arm = armTarget(p, side), torso = bodyPoint(p);
      const blend = 1 - smooth(40, 44, p.y);
      position = torso.lerp(arm.position, blend);
      rotation.slerp(arm.rotation, blend);
    } else if (handParts.has(part)) {
      rotation = qx(-Math.PI / 2 + .3);
      position = p.clone().sub(vec([7.9, 29.1, .65])).applyQuaternion(rotation).add(vec([4.8, 25.45, 3.8]));
      group = "leftHand";
    } else if (headParts.has(part)) {
      const neck = bodyPoint(vec([0, 50, 0]));
      const nod = qx(.14);
      position.sub(neck).applyQuaternion(nod).add(neck);
      rotation.premultiply(nod); group = "head";
    }
    rotation.multiply(new Quaternion().fromArray(data.transforms[i]));
    return { position, rotation, group, part, rest: p };
  });
  // The original pocketed hand is hidden by denim. Its revealed counterpart is
  // made from the free hand's actual blocks, mirrored as it leaves the pocket.
  const rightHand = [];
  data.voxels.forEach((v, i) => {
    if (!handParts.has(figureParts[i])) return;
    const rotation = qx(-Math.PI / 2 + .3);
    const p = vec([-v[0], v[1], v[2]]);
    const position = p.clone().sub(vec([-7.9, 29.1, .65])).applyQuaternion(rotation).add(vec([-4.8, 25.45, 3.8]));
    const t = data.transforms[i];
    rightHand.push({ position, rotation: rotation.multiply(new Quaternion(t[0], -t[1], -t[2], t[3])), scale: t.slice(4), color: v[3], part: figureParts[i] });
  });
  return { poses, rightHand };
}

// A short, silent performance phrase; no perpetual animation when the visitor stops.
export function playingGesture(seconds, side = 1) {
  const envelope = smooth(0, .6, seconds) * (1 - smooth(5.4, 6.4, seconds));
  const beat = seconds * Math.PI * 3.3 + (side < 0 ? 1.2 : 0);
  return { lift: envelope * (.09 + .16 * Math.sin(beat)), sway: envelope * Math.sin(seconds * 1.8) * .1, envelope };
}
