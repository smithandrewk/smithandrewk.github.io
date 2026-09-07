// WebKit normally gives Web Audio an ambient session, which obeys the ring/silent
// switch. Claim music playback only during intentional playing, then restore it.
// https://bugs.webkit.org/show_bug.cgi?id=252746#c2
export function createPlaybackSession(environment = globalThis.navigator) {
  let session, previous;
  return {
    acquire() {
      if (session) return;
      try {
        const candidate = environment?.audioSession;
        if (!candidate) return;
        const original = candidate.type;
        candidate.type = 'playback';
        session = candidate; previous = original;
      } catch { /* Older browsers and embedded hosts keep their normal audio path. */ }
    },
    release() {
      try { if (session?.type === 'playback') session.type = previous; }
      catch { /* A host may stop exposing the session during navigation. */ }
      session = undefined;
    },
  };
}
