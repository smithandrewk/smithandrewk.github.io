import test from "node:test";
import assert from "node:assert/strict";
import { bindPortraitRotation } from "../src/scripts/voxel/rotation-input.js";

function harness() {
  const stage = new EventTarget(),
    attributes = new Map(),
    capture = new Set();
  stage.ownerDocument = { defaultView: new EventTarget() };
  stage.setAttribute = (key, value) => attributes.set(key, value);
  stage.removeAttribute = (key) => attributes.delete(key);
  stage.hasPointerCapture = (id) => capture.has(id);
  stage.setPointerCapture = (id) => capture.add(id);
  stage.releasePointerCapture = (id) => capture.delete(id);
  const abort = new AbortController();
  let angle = 0,
    interactions = 0;
  bindPortraitRotation(stage, {
    getAngle: () => angle,
    setAngle: (value) => {
      angle = value;
    },
    onInteract: () => interactions++,
    signal: abort.signal,
  });
  function send(type, properties = {}) {
    const event = Object.assign(
      new Event(type, { cancelable: true }),
      properties,
    );
    stage.dispatchEvent(event);
    return event;
  }
  return {
    stage,
    send,
    abort,
    attributes,
    get angle() {
      return angle;
    },
    get interactions() {
      return interactions;
    },
  };
}
const finger = (x, y, identifier = 1) => ({
  clientX: x,
  clientY: y,
  identifier,
});
const pointer = (x, y) => ({
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: "touch",
  isPrimary: true,
  button: 0,
});

test("touch-only mobile previews rotate on horizontal swipes", () => {
  const h = harness();
  h.send("touchstart", { touches: [finger(100, 100)] });
  const move = h.send("touchmove", { touches: [finger(160, 103)] });
  assert.ok(Math.abs(h.angle + 0.36) < 1e-10);
  assert.equal(move.defaultPrevented, true);
  assert.equal(h.interactions, 1);
  h.send("touchend", { touches: [] });
  assert.equal(h.attributes.has("data-dragging"), false);
});

test("vertical touch swipes remain available for native page scrolling", () => {
  const h = harness();
  h.send("touchstart", { touches: [finger(100, 100)] });
  const move = h.send("touchmove", { touches: [finger(102, 180)] });
  assert.equal(h.angle, 0);
  assert.equal(move.defaultPrevented, false);
  assert.equal(h.interactions, 0);
});

test("mixed pointer and touch streams rotate once and survive pointer cancellation", () => {
  const h = harness();
  h.send("pointerdown", pointer(100, 100));
  h.send("touchstart", { touches: [finger(100, 100)] });
  h.send("pointermove", pointer(160, 100));
  h.send("pointercancel", pointer(160, 100));
  h.send("touchmove", { touches: [finger(160, 100)] });
  assert.ok(Math.abs(h.angle + 0.36) < 1e-10);
  assert.equal(h.interactions, 1);
});

test("pointer-only touch devices also rotate", () => {
  const h = harness();
  h.send("pointerdown", pointer(100, 100));
  h.send("pointermove", pointer(160, 100));
  assert.ok(Math.abs(h.angle + 0.36) < 1e-10);
});

test("pinch gestures and aborted listeners do not rotate the figure", () => {
  const h = harness();
  h.send("touchstart", { touches: [finger(100, 100), finger(200, 100, 2)] });
  const move = h.send("touchmove", {
    touches: [finger(80, 100), finger(220, 100, 2)],
  });
  assert.equal(move.defaultPrevented, false);
  assert.equal(h.angle, 0);
  h.abort.abort();
  h.send("touchstart", { touches: [finger(100, 100)] });
  h.send("touchmove", { touches: [finger(160, 100)] });
  assert.equal(h.angle, 0);
});

test("keyboard rotation preserves page and browser navigation keys", () => {
  const h = harness();
  assert.equal(h.send("keydown", { key: "ArrowRight" }).defaultPrevented, true);
  assert.ok(h.angle > 0);
  const angle = h.angle;
  assert.equal(h.send("keydown", { key: "PageDown" }).defaultPrevented, false);
  assert.equal(
    h.send("keydown", { key: "ArrowLeft", altKey: true }).defaultPrevented,
    false,
  );
  assert.equal(h.angle, angle);
  h.send("keydown", { key: "Escape" });
  assert.ok(Math.abs(h.angle + (24 * Math.PI) / 180) < 1e-10);
});
