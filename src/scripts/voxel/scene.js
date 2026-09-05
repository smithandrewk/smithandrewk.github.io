import * as THREE from "three";
import { figureData } from "./figure-data.js";
import { bindPortraitRotation } from "./rotation-input.js";
import {
  makePieces,
  piecePose,
  clamp,
  randomFor,
  scrollProgress,
} from "./motion.js";

export function mountPortrait(track) {
  const stage = track.querySelector("[data-voxel-stage]");
  const sticky = track.querySelector("[data-voxel-sticky]");
  const fallback = track.querySelector("[data-voxel-fallback]");
  const hints = track.querySelector("[data-voxel-hints]");
  const scrollHint = track.querySelector("[data-voxel-scroll-hint]");
  const scrollLabel = track.querySelector("[data-voxel-scroll-label]");
  const help = track.querySelector("[data-voxel-help]");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const events = new AbortController();
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-45, 45, 43, -43, 0.1, 500);
  const target = new THREE.Vector3(0, 29, 0);
  let yaw = (-24 * Math.PI) / 180,
    elevation = 0.22;
  function updateCamera() {
    const distance = 175;
    camera.position.set(
      Math.sin(yaw) * Math.cos(elevation) * distance,
      29 + Math.sin(elevation) * distance,
      Math.cos(yaw) * Math.cos(elevation) * distance,
    );
    camera.lookAt(target);
  }
  scene.add(new THREE.HemisphereLight(0xfff3e4, 0xb5aaa0, 1.3));
  const key = new THREE.DirectionalLight(0xffefd9, 2.6);
  key.position.set(-45, 95, 65);
  key.target.position.set(0, 25, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -55;
  key.shadow.camera.right = 55;
  key.shadow.camera.top = 80;
  key.shadow.camera.bottom = -45;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 240;
  key.shadow.normalBias = 0.035;
  key.shadow.bias = -0.00012;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xe5edff, 0.3);
  fill.position.set(55, 40, 10);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1d9, 0.4);
  rim.position.set(5, 80, -60);
  scene.add(rim);

  // Rounded solid geometry; normals follow each bevel rather than the original box faces.
  function roundedCube(size = 0.98, radius = 0.18) {
    const g = new THREE.BoxGeometry(size, size, size, 6, 6, 6),
      pos = g.attributes.position,
      norm = g.attributes.normal;
    const core = size / 2 - radius,
      point = new THREE.Vector3(),
      inner = new THREE.Vector3(),
      out = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      point.fromBufferAttribute(pos, i);
      inner.set(
        clamp(point.x, -core, core),
        clamp(point.y, -core, core),
        clamp(point.z, -core, core),
      );
      out.copy(point).sub(inner).normalize();
      point.copy(inner).addScaledVector(out, radius);
      pos.setXYZ(i, point.x, point.y, point.z);
      norm.setXYZ(i, out.x, out.y, out.z);
    }
    g.computeBoundingSphere();
    return g;
  }
  const geometry = roundedCube();
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0,
  });
  const mesh = new THREE.InstancedMesh(
    geometry,
    material,
    figureData.voxels.length,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.position.y = -0.45;
  scene.add(mesh);
  const color = new THREE.Color();
  figureData.voxels.forEach((v, i) => {
    color.set(v[3]);
    mesh.setColorAt(i, color);
  });
  const pieces = makePieces(figureData),
    dummy = new THREE.Object3D(),
    local = new THREE.Vector3();
  const assemblyEnd = Math.max(
    ...pieces.map((piece) => piece.start + piece.duration),
  );
  const restRotations = figureData.transforms.map((t) =>
    new THREE.Quaternion().fromArray(t),
  );
  const fallRotation = new THREE.Quaternion(),
    fallAxis = new THREE.Vector3(0, 0, 1);
  function updateFigure(progress) {
    pieces.forEach((piece) => {
      const pose = piecePose(piece, progress),
        cos = Math.cos(pose.rotation),
        sin = Math.sin(pose.rotation);
      fallRotation.setFromAxisAngle(fallAxis, pose.rotation);
      piece.indices.forEach((i) => {
        const v = figureData.voxels[i];
        local.set(
          v[0] - piece.center[0],
          v[1] - piece.center[1],
          v[2] - piece.center[2],
        );
        dummy.position.set(
          piece.center[0] + local.x * cos - local.y * sin + pose.slide,
          piece.center[1] + local.x * sin + local.y * cos + pose.drop,
          piece.center[2] + local.z,
        );
        dummy.quaternion.copy(restRotations[i]).premultiply(fallRotation);
        dummy.scale.fromArray(figureData.transforms[i], 4);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  // A subtly bevelled stone plinth, rather than a voxel island.
  const profile = [
    new THREE.Vector2(0, -4.3),
    new THREE.Vector2(11.8, -4.3),
    new THREE.Vector2(12.05, -4.2),
    new THREE.Vector2(12.15, -4),
    new THREE.Vector2(12.15, -0.2),
    new THREE.Vector2(12.05, -0.05),
    new THREE.Vector2(11.85, 0),
    new THREE.Vector2(0, 0),
  ];
  const stoneCanvas = document.createElement("canvas");
  stoneCanvas.width = 256;
  stoneCanvas.height = 256;
  const textureContext = stoneCanvas.getContext("2d"),
    pixels = textureContext.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const value = 215 + Math.round(randomFor(i) * 30);
    pixels.data.set([value, value, value, 255], i * 4);
  }
  textureContext.putImageData(pixels, 0, 0);
  const grain = new THREE.CanvasTexture(stoneCanvas);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(6, 2);
  grain.colorSpace = THREE.SRGBColorSpace;
  const stone = new THREE.MeshStandardMaterial({
    color: 0xc9c1b4,
    map: grain,
    roughness: 1,
    bumpMap: grain,
    bumpScale: 0.025,
  });
  const pedestal = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), stone);
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext("2d"),
    shadowGradient = shadowContext.createRadialGradient(64, 64, 24, 64, 64, 64);
  shadowGradient.addColorStop(0, "rgba(54,44,32,.32)");
  shadowGradient.addColorStop(0.68, "rgba(54,44,32,.14)");
  shadowGradient.addColorStop(1, "rgba(54,44,32,0)");
  shadowContext.fillStyle = shadowGradient;
  shadowContext.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 32),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(1, -4.3, -1);
  scene.add(contactShadow);

  let progress = 0,
    desired = 0,
    raf = 0,
    lastTime = 0,
    isVisible = true,
    disposed = false;
  function scrollBounds() {
    const pinTop = parseFloat(getComputedStyle(sticky).top) || 0;
    const rect = track.getBoundingClientRect();
    return {
      top: scrollY + rect.top - pinTop,
      travel: Math.max(1, rect.height - sticky.offsetHeight),
    };
  }
  function measureProgress() {
    if (reducedMotion.matches) return 1;
    const { top, travel } = scrollBounds();
    return scrollProgress(scrollY, top, travel, 0);
  }
  function draw(time) {
    raf = 0;
    if (disposed || !isVisible || document.hidden) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.06) : 0.016;
    lastTime = time;
    const delta = desired - progress;
    progress =
      Math.abs(delta) < 0.00008
        ? desired
        : progress + delta * (1 - Math.exp(-dt * 16));
    updateFigure(progress);
    updateCamera();
    renderer.render(scene, camera);
    const assembly = clamp(progress / assemblyEnd);
    track.dataset.progress = String(Math.round(assembly * 100));
    scrollLabel.textContent =
      assembly >= 1 ? "Scroll up to replay" : "Scroll to assemble";
    fallback.hidden = true;
    hints.hidden = false;
    track.dataset.ready = "true";
    if (Math.abs(desired - progress) > 0.00008) requestDraw();
  }
  function requestDraw() {
    if (!raf && !disposed && isVisible && !document.hidden)
      raf = requestAnimationFrame(draw);
  }
  function onScroll() {
    if (!isVisible) return;
    const next = measureProgress();
    if (Math.abs(next - desired) > 0.003) track.dataset.scrollUsed = "true";
    desired = next;
    requestDraw();
  }
  function resize() {
    const w = stage.clientWidth,
      h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const worldHeight = 76,
      worldWidth = (worldHeight * w) / h;
    camera.left = -worldWidth / 2;
    camera.right = worldWidth / 2;
    camera.top = worldHeight / 2;
    camera.bottom = -worldHeight / 2;
    camera.updateProjectionMatrix();
    desired = measureProgress();
    requestDraw();
  }
  function setYaw(value) {
    yaw = clamp(value, -Math.PI, Math.PI);
    const degrees = Math.round((yaw * 180) / Math.PI);
    stage.setAttribute("aria-valuenow", String(degrees));
    stage.setAttribute("aria-valuetext", `${degrees} degrees`);
    requestDraw();
  }
  // The stage is the rotation control, so keyboard users need no extra buttons.
  stage.tabIndex = 0;
  stage.setAttribute("role", "slider");
  stage.setAttribute("aria-label", "Rotate Andrew's 3D portrait");
  stage.setAttribute("aria-orientation", "horizontal");
  stage.setAttribute("aria-valuemin", "-180");
  stage.setAttribute("aria-valuemax", "180");
  stage.setAttribute("aria-describedby", "portrait-help");
  setYaw(yaw);

  bindPortraitRotation(stage, {
    getAngle: () => yaw,
    setAngle: setYaw,
    onInteract: () => {
      track.dataset.dragUsed = "true";
    },
    signal: events.signal,
  });

  function applyMotionPreference() {
    scrollHint.hidden = reducedMotion.matches;
    help.textContent = reducedMotion.matches
      ? "Drag sideways or use the arrow keys to rotate. Escape resets the view."
      : "Drag sideways or use the arrow keys to rotate. Scroll or use Page Up and Page Down to assemble. Escape resets the view.";
    desired = measureProgress();
    if (reducedMotion.matches) progress = 1;
    resize();
  }
  function applyTheme() {
    const dark = document.documentElement.classList.contains("dark");
    key.intensity = dark ? 2.2 : 2.6;
    stone.color.set(dark ? 0x9e978b : 0xc9c1b4);
    requestDraw();
  }
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      isVisible = entries[0].isIntersecting;
      track.dataset.visible = String(isVisible);
      if (isVisible) {
        lastTime = 0;
        onScroll();
      } else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    { rootMargin: "100px" },
  );
  visibilityObserver.observe(sticky);
  window.addEventListener("scroll", onScroll, {
    passive: true,
    signal: events.signal,
  });
  window.addEventListener("resize", resize, {
    passive: true,
    signal: events.signal,
  });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else {
        lastTime = 0;
        onScroll();
      }
    },
    { signal: events.signal },
  );
  reducedMotion.addEventListener("change", applyMotionPreference, {
    signal: events.signal,
  });
  function dispose() {
    if (disposed) return;
    disposed = true;
    events.abort();
    cancelAnimationFrame(raf);
    visibilityObserver.disconnect();
    resizeObserver.disconnect();
    themeObserver.disconnect();
    const textures = new Set(),
      materials = new Set(),
      geometries = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material)
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material))
            if (value?.isTexture) textures.add(value);
        }
    });
    for (const resource of [...textures, ...materials, ...geometries])
      resource.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
  renderer.domElement.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      dispose();
      fallback.hidden = false;
      hints.hidden = true;
      stage.tabIndex = -1;
      stage.setAttribute("role", "img");
      stage.setAttribute("aria-label", "Andrew Smith");
      for (const attribute of [
        "aria-valuenow",
        "aria-valuetext",
        "aria-valuemin",
        "aria-valuemax",
        "aria-orientation",
        "aria-describedby",
      ])
        stage.removeAttribute(attribute);
      delete track.dataset.ready;
      track.dataset.unavailable = "true";
    },
    { signal: events.signal },
  );
  document.addEventListener("astro:before-swap", dispose, {
    signal: events.signal,
  });
  window.addEventListener(
    "pagehide",
    (event) => {
      if (!event.persisted) dispose();
    },
    { signal: events.signal },
  );
  window.addEventListener(
    "pageshow",
    () => {
      lastTime = 0;
      onScroll();
    },
    { signal: events.signal },
  );
  applyMotionPreference();
  applyTheme();
  progress = desired;
  resize();
  return dispose;
}
