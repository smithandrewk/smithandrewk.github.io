// Touch events cover mobile previews and browsers that cancel pointer streams
// when deciding whether a gesture belongs to page scrolling.
export function bindPortraitRotation(
  stage,
  { getAngle, setAngle, onInteract, signal },
) {
  let gesture = null;
  const wrap = (angle) =>
    ((((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) -
    Math.PI;

  function endGesture() {
    const pointerId = gesture?.pointerId;
    gesture = null;
    stage.removeAttribute("data-dragging");
    if (pointerId !== undefined && stage.hasPointerCapture(pointerId)) {
      stage.releasePointerCapture(pointerId);
    }
  }

  function move(x, y) {
    if (!gesture) return false;
    if (!gesture.active) {
      const dx = Math.abs(x - gesture.startX);
      const dy = Math.abs(y - gesture.startY);
      if (Math.max(dx, dy) < 8) return false;
      if (dy > dx * 1.2) {
        endGesture();
        return false;
      }
      if (dx < dy * 1.2) return false;
      gesture.active = true;
      // Touch needs no pointer capture; it already follows its starting target.
      if (gesture.kind === "pointer" && !gesture.touch) {
        stage.setPointerCapture(gesture.pointerId);
      }
      stage.setAttribute("data-dragging", "");
      onInteract();
    }
    setAngle(wrap(getAngle() - (x - gesture.lastX) * 0.006));
    gesture.lastX = x;
    return true;
  }

  stage.addEventListener(
    "pointerdown",
    (event) => {
      if (event.isPrimary === false) {
        if (event.pointerType === "touch") endGesture();
        return;
      }
      if (event.pointerType !== "touch" && event.button !== 0) return;
      gesture = {
        kind: "pointer",
        pointerId: event.pointerId,
        touch: event.pointerType === "touch",
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        active: false,
      };
    },
    { signal },
  );
  stage.addEventListener(
    "pointermove",
    (event) => {
      if (gesture?.kind !== "pointer" || event.pointerId !== gesture.pointerId)
        return;
      move(event.clientX, event.clientY);
    },
    { signal },
  );
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    stage.addEventListener(
      name,
      (event) => {
        if (
          gesture?.kind === "pointer" &&
          event.pointerId === gesture.pointerId
        )
          endGesture();
      },
      { signal },
    );
  }
  stage.addEventListener(
    "pointerleave",
    () => {
      if (gesture?.kind === "pointer" && !gesture.active && !gesture.touch)
        endGesture();
    },
    { signal },
  );

  stage.addEventListener(
    "touchstart",
    (event) => {
      endGesture();
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      gesture = {
        kind: "touch",
        touchId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        active: false,
      };
    },
    { signal, passive: true },
  );
  stage.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length !== 1) {
        endGesture();
        return;
      }
      if (gesture?.kind !== "touch") return;
      const touch = Array.from(event.touches).find(
        (t) => t.identifier === gesture.touchId,
      );
      if (touch && move(touch.clientX, touch.clientY) && event.cancelable)
        event.preventDefault();
    },
    { signal, passive: false },
  );
  stage.addEventListener(
    "touchend",
    (event) => {
      if (
        gesture?.kind === "touch" &&
        !Array.from(event.touches).some((t) => t.identifier === gesture.touchId)
      )
        endGesture();
    },
    { signal },
  );
  stage.addEventListener("touchcancel", endGesture, { signal });

  stage.addEventListener(
    "keydown",
    (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const angle = getAngle(),
        step = Math.PI / 18;
      const turns = {
        ArrowLeft: angle - step,
        ArrowDown: angle - step,
        ArrowRight: angle + step,
        ArrowUp: angle + step,
        Home: -Math.PI,
        End: Math.PI,
        Escape: (-24 * Math.PI) / 180,
      };
      if (!Object.hasOwn(turns, event.key)) return;
      event.preventDefault();
      endGesture();
      onInteract();
      setAngle(turns[event.key]);
    },
    { signal },
  );
  stage.ownerDocument.defaultView.addEventListener("blur", endGesture, {
    signal,
  });
  signal.addEventListener("abort", endGesture, { once: true });
}
