export function observePortrait() {
  const track = document.querySelector<HTMLElement>("[data-voxel-track]");
  if (!track || track.dataset.observed) return;
  track.dataset.observed = "true";

  // Keep the Three.js renderer and sculpture data out of the hero's critical path.
  const observer = new IntersectionObserver(
    async (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      try {
        const { mountPortrait } = await import("./voxel/scene.js");
        if (track.isConnected) mountPortrait(track);
      } catch {
        // The image and all of the page's original content remain available.
        track.dataset.unavailable = "true";
      }
    },
    { rootMargin: "500px 0px" },
  );
  observer.observe(track);
}
