// ============================================================================
// Client-side "your order is ready" alert: short vibration pattern + a rising
// three-note chime. Best-effort — mobile browsers only allow audio after a
// user gesture, so failures are swallowed silently.
// ============================================================================

export function vibrate(pattern: number | number[] = [200, 100, 200, 100, 400]) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* unsupported */
  }
}

export function chime() {
  try {
    if (typeof window === "undefined") return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const start = ctx.currentTime;
    const notes: Array<[number, number]> = [
      [880, 0],
      [1100, 0.18],
      [1320, 0.36],
    ];
    for (const [freq, at] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, start + at);
      gain.gain.exponentialRampToValueAtTime(0.25, start + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.16);
      osc.start(start + at);
      osc.stop(start + at + 0.18);
    }
    window.setTimeout(() => { ctx.close().catch(() => {}); }, 900);
  } catch {
    /* unsupported / blocked */
  }
}

/** Vibrate + chime. */
export function readyAlert() {
  vibrate();
  chime();
}
