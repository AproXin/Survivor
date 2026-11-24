// Procedural Web Audio Chinese folk/action sound synthesizer (pentatonic plucks, opera gong, bronze bell, silk swoosh)

const PENTATONIC_HZ = [293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];

export class InkAudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private unlocked = false;
  private xpComboStep = 0;
  private lastXpTime = 0;

  constructor(initialMuted = false) {
    this.muted = initialMuted;
  }

  public unlockByGesture(): void {
    this.unlocked = true;
    this.ensureContext();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(m: boolean): void {
    this.muted = m;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || !this.unlocked) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          return null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** Warm ember whoosh when Lantern Youth casts flame. */
  public playLanternCast(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const base = 360 + (Math.random() - 0.5) * 40;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.45, now + 0.08);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** Crisp metallic ink-sword slash for Sheng face. */
  public playSwordSlash(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    const pitch = 780 + (Math.random() - 0.5) * 110;
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.value = 1.6;

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  /** Ethereal silk water-sleeve sweep for Dan face. */
  public playSleeveSweep(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(1650, now + 0.14);
    filter.Q.value = 2.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now);
  }

  /** Pentatonic guzheng pluck when collecting XP jade gem. */
  public playXpPickup(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastXpTime < 0.7) {
      this.xpComboStep = Math.min(PENTATONIC_HZ.length - 1, this.xpComboStep + 1);
    } else {
      this.xpComboStep = 0;
    }
    this.lastXpTime = now;
    const freq = PENTATONIC_HZ[this.xpComboStep];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.005, now + 0.16);
    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  /** Crisp enemy hit thump. */
  public playHit(heavy = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const startFreq = heavy ? 165 : 230 + (Math.random() - 0.5) * 30;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + (heavy ? 0.14 : 0.075));
    gain.gain.setValueAtTime(heavy ? 0.14 : 0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (heavy ? 0.15 : 0.08));
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (heavy ? 0.16 : 0.09));
  }

  /** Dramatic Chinese opera gong + wooden clapper on Realm Flip / Face Change. */
  public playRealmFlip(toSpectral: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Wooden opera clapper (梆子) crisp snap
    const snap = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snap.type = 'square';
    snap.frequency.setValueAtTime(toSpectral ? 980 : 760, now);
    snap.frequency.exponentialRampToValueAtTime(340, now + 0.035);
    snapGain.gain.setValueAtTime(0.09, now);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    snap.connect(snapGain).connect(ctx.destination);
    snap.start(now);
    snap.stop(now + 0.05);

    // Resonant bronze gong with pitch bend (大锣)
    const freqs = toSpectral ? [196, 287, 415] : [220, 329.6, 466];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f * (toSpectral ? 1.06 : 0.96), now);
      osc.frequency.exponentialRampToValueAtTime(f * (toSpectral ? 0.92 : 1.04), now + 0.45);
      g.gain.setValueAtTime(0.09 / (idx + 1), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      osc.connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.58);
    });
  }

  /** Quick crisp clapper snap when toggling Sheng <-> Dan inside Spectral Realm. */
  public playFaceToggle(isDan: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isDan ? 587.33 : 440, now);
    osc.frequency.exponentialRampToValueAtTime(isDan ? 784 : 330, now + 0.09);
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** Haunting bronze bell chime on rule warning or violation. */
  public playRuleBell(violation: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const partials = violation ? [185, 277.18, 392, 554.37] : [523.25, 783.99];
    partials.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      g.gain.setValueAtTime((violation ? 0.1 : 0.055) / (idx + 1), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + (violation ? 0.85 : 0.35));
      osc.connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + (violation ? 0.9 : 0.38));
    });
  }

  /** Player damaged low thud + dissonant ring. */
  public playPlayerHurt(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.18);
    g.gain.setValueAtTime(0.13, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  /** Ascending pentatonic chord on Level Up or Victory. */
  public playFanfare(victory = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = victory ? [293.66, 392.0, 440.0, 587.33, 783.99] : [392.0, 440.0, 587.33];
    notes.forEach((f, i) => {
      const t = now + i * 0.075;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  /** Somber descending bell on Defeat. */
  public playDefeat(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [329.63, 293.66, 220.0, 146.83].forEach((f, i) => {
      const t = now + i * 0.14;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.68);
    });
  }
}
