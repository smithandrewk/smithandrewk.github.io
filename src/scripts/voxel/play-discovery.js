import { clamp } from './motion.js';
import { smooth } from './performance-motion.js';

// Keep the original choreography's pace, then devote the final scroll section
// to the playable close-up. CSS uses 4.4 viewports instead of the original 3.2.
export function portraitChapters(progress, reduced = false) {
  return reduced ? { story: 1, reveal: 0 } : { story: clamp(progress / .65), reveal: smooth(.68, .82, progress) };
}

export function createPlayDiscovery() {
  let mode = null, dismissed = false;
  return {
    enter() { mode = 'manual'; dismissed = false; },
    dismiss() { mode = null; dismissed = true; },
    scroll() { if (mode === 'manual') mode = null; },
    update(available, reveal) {
      if (!available) { mode = null; dismissed = false; }
      if (reveal <= .01) { dismissed = false; if (mode === 'auto') mode = null; }
      if (available && reveal > .01 && !mode && !dismissed) mode = 'auto';
      return { open: mode !== null, focus: mode === 'manual' ? 1 : mode === 'auto' ? reveal : 0 };
    },
  };
}
